import { Router } from "express";
import Razorpay from "razorpay";
import rateLimit from "express-rate-limit";
import { getServiceClient } from "../supabase";

const router = Router();

// Middleware to extract user ID from auth object with safety checks (same logic as profileService)
const extractUser = (req: any, res: any, next: any) => {
  // Extract user ID from auth object with safety checks
  let userId: string | null = null;
  const auth = req.auth;
  if (auth) {
    // Try auth.uid() as a function
    if (typeof auth.uid === 'function') {
      try {
        userId = auth.uid();
      } catch (err) {
        console.error("Error calling auth.uid():", err);
      }
    }
    // Try auth.uid as a property
    else if (auth.uid && typeof auth.uid === 'string') {
      userId = auth.uid;
    }
    // Try other common properties
    else if (auth.userId && typeof auth.userId === 'string') {
      userId = auth.userId;
    }
    else if (auth.sub && typeof auth.sub === 'string') {
      userId = auth.sub;
    }
    else if (auth.id && typeof auth.id === 'string') {
      userId = auth.id;
    }
    // Try auth.claims.sub as a property path (JWT sub claim)
    else if (auth.claims && typeof auth.claims === 'object' && auth.claims.sub && typeof auth.claims.sub === 'string') {
      userId = auth.claims.sub;
    }
  }

  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  req.userId = userId;
  next();
};

const orderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // limit each IP to 10 orders per windowMs
  message: { error: "Too many orders created from this IP, please try again after an hour." },
});

// GET /api/premium/config - Check if premium is enabled for online payments
router.get("/config", async (req, res) => {
  try {
    const sb = getServiceClient();
    const { data, error } = await sb
      .from("plan_settings")
      .select("enabled")
      .eq("id", 1)
      .single();

    if (error) throw error;

    res.json({ online: data.enabled });
  } catch (error) {
    console.error("Error fetching premium config:", error);
    res.status(500).json({ error: "Failed to fetch premium config" });
  }
});

// POST /api/premium/order - Create a Razorpay order for premium subscription
router.post("/order", orderLimiter, extractUser, async (req: any, res: any) => {
  try {
    const { plan, coupon } = req.body;

    // Validate plan
    if (plan !== "monthly" && plan !== "yearly") {
      return res.status(400).json({ error: "Invalid plan. Must be 'monthly' or 'yearly'" });
    }

    const sb = getServiceClient();

    // Get plan settings
    const { data: settingsData, error: settingsError } = await sb
      .from("plan_settings")
      .select("price_monthly, price_yearly")
      .eq("id", 1)
      .single();

    if (settingsError) throw settingsError;

    // Get base price
    let basePrice = plan === "yearly" ? settingsData.price_yearly : settingsData.price_monthly;

    // Apply coupon if provided
    let finalPrice = basePrice;
    let couponApplied = false;
    let couponCodeToStore = null;

    if (coupon && coupon.trim() !== "") {
      const couponCode = coupon.trim().toUpperCase();
      const { data: couponData, error: couponError } = await sb
        .rpc("check_coupon", { p_code: couponCode });

      if (couponError) throw couponError;

      const couponResult = couponData as { monthly: any; yearly: any };
      let planResult: any = null;

      if (plan === "monthly") {
        planResult = couponResult.monthly;
      } else if (plan === "yearly") {
        planResult = couponResult.yearly;
      }

      if (planResult && planResult.ok) {
        finalPrice = planResult.final;
        couponApplied = true;
        couponCodeToStore = couponCode;
      }
    }

    // Convert price to paise (smallest currency unit)
    const amountPaise = finalPrice * 100;

    // Initialize Razorpay
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });

    // Create order options
    const options = {
      amount: amountPaise,
      currency: "INR",
      receipt: `receipt_${plan}_${Date.now()}`,
      notes: {
        userId: req.userId,
        plan: plan,
        coupon: couponApplied ? coupon : "",
      }
    };

    // Create the order
    const order = await razorpay.orders.create(options);

    // Create payment record with status 'created'
    const { data: paymentData, error: paymentError } = await sb
      .from("payments")
      .insert({
        user_id: req.userId,
        plan: plan,
        amount_paise: amountPaise,
        razorpay_order_id: order.id,
        status: "created",
        coupon_code: couponCodeToStore
      })
      .select()
      .single();

    if (paymentError) throw paymentError;

    res.json({
      keyId: process.env.RAZORPAY_KEY_ID,
      orderId: order.id,
      amount: amountPaise,
      currency: "INR",
      plan: plan,
      coupon: couponApplied ? coupon : "",
      finalPrice: finalPrice
    });
  } catch (error) {
    console.error("Error creating premium order:", error);
    res.status(500).json({ error: "Failed to create premium order" });
  }
});

// POST /api/premium/verify - Verify Razorpay payment and activate premium
router.post("/verify", extractUser, async (req: any, res: any) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    // Verify Razorpay signature
    const crypto = require("crypto");
    const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!);
    hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
    const generated_signature = hmac.digest("hex");

    if (generated_signature !== razorpay_signature) {
      return res.status(400).json({ error: "Invalid signature" });
    }

    // Payment is valid, activate premium
    const sb = getServiceClient();

    // Get the payment record to verify plan and coupon info
    const { data: paymentData, error: paymentError } = await sb
      .from("payments")
      .select("*")
      .eq("razorpay_order_id", razorpay_order_id)
      .single();

    if (paymentError) throw paymentError;

    // Verify the payment belongs to the current user
    if (paymentData.user_id !== req.userId) {
      return res.status(403).json({ error: "Payment does not belong to user" });
    }

    // Update payment status
    const { error: updateError } = await sb
      .from("payments")
      .update({
        status: "paid",
        razorpay_payment_id: razorpay_payment_id,
        paid_at: new Date().toISOString()
      })
      .eq("razorpay_order_id", razorpay_order_id);

    if (updateError) throw updateError;

    // Update user's subscription tier to premium
    const { error: profileError } = await sb
      .from("profiles")
      .update({ subscription_tier: "premium" })
      .eq("id", req.userId);

    if (profileError) throw profileError;

    // Calculate premium end date (30 days for monthly, 365 days for yearly)
    const plan = paymentData.plan;
    const startsAt = new Date();
    const endsAt = new Date();

    if (plan === "yearly") {
      endsAt.setFullYear(endsAt.getFullYear() + 1);
    } else {
      endsAt.setMonth(endsAt.getMonth() + 1);
    }

    // Create subscription record
    const { data: subscriptionData, error: subscriptionError } = await sb
      .from("subscriptions")
      .insert({
        user_id: req.userId,
        plan: plan,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        amount: paymentData.amount_paise / 100, // Convert from paise to rupees
        source: "razorpay",
        method: paymentData.method || "UPI",
        note: paymentData.coupon_code ? `Coupon ${paymentData.coupon_code}` : undefined,
        payment_id: paymentData.id,
        created_by: req.userId
      })
      .select()
      .single();

    if (subscriptionError) throw subscriptionError;

    res.json({
      success: true,
      until: endsAt.toISOString(),
      subscriptionId: subscriptionData.id
    });
  } catch (error) {
    console.error("Error verifying premium payment:", error);
    res.status(500).json({ error: "Failed to verify premium payment" });
  }
});

// Test route
router.get("/test", (req, res) => {
  res.json({ message: "Premium route is working!" });
});

export default router;
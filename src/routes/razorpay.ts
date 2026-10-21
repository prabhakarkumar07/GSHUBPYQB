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
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: "Too many orders created from this IP, please try again after an hour." },
});

router.post("/create-order", orderLimiter, extractUser, async (req: any, res: any) => {
  try {
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });

    const options = {
      amount: req.body.amount, // amount in smallest currency unit (paise)
      currency: "INR",
      receipt: "receipt_order_" + Date.now(),
    };

    const order = await razorpay.orders.create(options);
    res.json({ orderId: order.id });
  } catch (error) {
    console.error("Razorpay Order Error:", error);
    res.status(500).json({ error: "Failed to create order" });
  }
});

router.post("/verify-payment", extractUser, async (req: any, res: any) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan_name, amount, method } = req.body;

  try {
    const crypto = require("crypto");
    const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!);
    hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
    const generated_signature = hmac.digest("hex");

    if (generated_signature === razorpay_signature) {
      // Payment is successful, upgrade user to premium!
      const sb = getServiceClient();
      
      const { error } = await sb
        .from("profiles")
        .update({ subscription_tier: "premium" })
        .eq("id", req.userId);
        
      if (!error) {
        await sb.from("payments").insert({
          user_id: req.userId,
          amount: amount || 0,
          plan_name: plan_name || "Premium",
          razorpay_order_id,
          razorpay_payment_id,
          method: method || "UPI"
        });
      }
        
      if (error) {
        console.error("Failed to update subscription tier:", error);
        return res.status(500).json({ error: "Payment verified, but failed to upgrade account." });
      }

      res.json({ success: true });
    } else {
      res.status(400).json({ error: "Invalid signature" });
    }
  } catch (error) {
    console.error("Payment Verification Error:", error);
    res.status(500).json({ error: "Failed to verify payment" });
  }
});

export default router;

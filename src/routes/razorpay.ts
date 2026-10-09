import { Router } from "express";
import { requireAuth } from "@clerk/express";
import Razorpay from "razorpay";
import rateLimit from "express-rate-limit";

const router = Router();

// Strict rate limit for creating orders (10 per hour per IP)
const orderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: "Too many orders created from this IP, please try again after an hour." },
});

router.post("/create-order", orderLimiter, requireAuth(), async (req: any, res: any) => {
  const clerkUserId = req.auth.userId;
  if (!clerkUserId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const rzp = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID || "",
      key_secret: process.env.RAZORPAY_KEY_SECRET || "",
    });

    const amount = 499 * 100; // Rs 499 in paise

    const order = await rzp.orders.create({
      amount,
      currency: "INR",
      receipt: `receipt_${clerkUserId}_${Date.now()}`,
      notes: {
        userId: clerkUserId,
      },
    });

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID, // Send key to frontend for checkout initialization
    });
  } catch (error: any) {
    console.error("Razorpay create-order error:", error);
    res.status(500).json({ error: error.message || "Failed to create Razorpay order" });
  }
});

export default router;

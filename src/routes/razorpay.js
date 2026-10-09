"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_2 = require("@clerk/express");
const razorpay_1 = __importDefault(require("razorpay"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const router = (0, express_1.Router)();
// Strict rate limit for creating orders (10 per hour per IP)
const orderLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: { error: "Too many orders created from this IP, please try again after an hour." },
});
router.post("/create-order", orderLimiter, (0, express_2.requireAuth)(), async (req, res) => {
    const clerkUserId = req.auth.userId;
    if (!clerkUserId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    try {
        const rzp = new razorpay_1.default({
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
    }
    catch (error) {
        console.error("Razorpay create-order error:", error);
        res.status(500).json({ error: error.message || "Failed to create Razorpay order" });
    }
});
exports.default = router;
//# sourceMappingURL=razorpay.js.map
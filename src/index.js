"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const crypto_1 = __importDefault(require("crypto"));
const supabase_js_1 = require("@supabase/supabase-js");
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
// Load environment variables
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 8000;
// Supabase Admin Client (Bypasses RLS to update profiles safely)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseServiceKey);
const razorpayWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
// Security Middleware
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({ origin: process.env.FRONTEND_URL || "*" }));
// Global Rate Limiting (200 requests per 15 minutes per IP)
const globalLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { error: "Too many requests from this IP, please try again after 15 minutes." },
});
app.use("/api/", globalLimiter);
// Razorpay sends JSON, so we parse it
app.use(express_1.default.json());
const express_2 = require("@clerk/express");
const taxonomy_1 = __importDefault(require("./routes/taxonomy"));
const profile_1 = __importDefault(require("./routes/profile"));
const quiz_1 = __importDefault(require("./routes/quiz"));
const user_1 = __importDefault(require("./routes/user"));
const admin_1 = __importDefault(require("./routes/admin"));
const razorpay_1 = __importDefault(require("./routes/razorpay"));
const challenge_1 = __importDefault(require("./routes/challenge"));
const live_exam_1 = __importDefault(require("./routes/live-exam"));
// Clerk Auth Middleware (makes req.auth available)
app.use((0, express_2.clerkMiddleware)());
// Routes
app.use("/api/taxonomy", taxonomy_1.default);
app.use("/api/profile", profile_1.default);
app.use("/api/quiz", quiz_1.default);
app.use("/api/user", user_1.default);
app.use("/api/admin", admin_1.default);
app.use("/api/razorpay", razorpay_1.default);
app.use("/api/challenge", challenge_1.default);
app.use("/api/live-exams", live_exam_1.default);
app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok" });
});
app.post("/api/webhooks/razorpay", async (req, res) => {
    try {
        const signature = req.headers["x-razorpay-signature"];
        const body = JSON.stringify(req.body);
        // 1. Verify the Razorpay Webhook Signature
        const expectedSignature = crypto_1.default
            .createHmac("sha256", razorpayWebhookSecret)
            .update(body)
            .digest("hex");
        if (expectedSignature !== signature) {
            console.error("Invalid Razorpay signature.");
            return res.status(400).json({ error: "Invalid signature" });
        }
        // 2. Process the event
        const event = req.body;
        // Check if the payment was successful
        if (event.event === "payment.captured" || event.event === "order.paid") {
            const paymentEntity = event.payload.payment.entity;
            // We expect the frontend to pass the user's Clerk ID in the payment notes
            const clerkUserId = paymentEntity.notes?.userId;
            if (!clerkUserId) {
                console.error("No userId found in Razorpay payment notes.");
                return res.status(400).json({ error: "Missing userId in notes" });
            }
            console.log(`Upgrading user ${clerkUserId} to premium...`);
            // 3. Update the user's profile in Supabase to 'premium'
            const { error } = await supabase
                .from("profiles")
                .update({ subscription_tier: "premium" })
                .eq("id", clerkUserId);
            if (error) {
                console.error("Failed to update profile in Supabase:", error);
                return res.status(500).json({ error: "Database update failed" });
            }
            console.log("Successfully upgraded user to premium!");
        }
        // Return 200 OK so Razorpay knows we received it
        res.status(200).json({ status: "success" });
    }
    catch (error) {
        console.error("Webhook error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
app.listen(port, () => {
    console.log(`Backend server is running on http://localhost:${port}`);
});
//# sourceMappingURL=index.js.map
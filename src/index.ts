import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 8000;

// Supabase Admin Client (Bypasses RLS to update profiles safely)
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const razorpayWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET!;

// Security Middleware
app.use(helmet());
app.use(cors({ origin: "*" })); // Allow all origins for local development

// Global Rate Limiting (200 requests per 15 minutes per IP)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: "Too many requests from this IP, please try again after 15 minutes." },
});
app.use("/api/", globalLimiter);

// Razorpay sends JSON, so we parse it
app.use(express.json());

import { clerkMiddleware } from "@clerk/express";
import taxonomyRouter from "./routes/taxonomy";
import profileRouter from "./routes/profile";
import quizRouter from "./routes/quiz";
import userRouter from "./routes/user";
import adminRouter from "./routes/admin";
import razorpayRouter from "./routes/razorpay";
import challengeRouter from "./routes/challenge";
import liveExamRouter from "./routes/live-exam";

// Clerk Auth Middleware (makes req.auth available)
app.use(clerkMiddleware());

// Routes
app.use("/api/taxonomy", taxonomyRouter);
app.use("/api/profile", profileRouter);
app.use("/api/quiz", quizRouter);
app.use("/api/user", userRouter);
app.use("/api/admin", adminRouter);
app.use("/api/razorpay", razorpayRouter);
app.use("/api/challenge", challengeRouter);
app.use("/api/live-exams", liveExamRouter);

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.post("/api/webhooks/razorpay", async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"] as string;
    const body = JSON.stringify(req.body);

    // 1. Verify the Razorpay Webhook Signature
    const expectedSignature = crypto
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
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(port, () => {
  console.log(`Backend server is running on http://localhost:${port}`);
});

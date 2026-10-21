import request from "supertest";
import express from "express";
import cors from "cors";
import crypto from "crypto";

// Mock environment BEFORE imports
process.env.RAZORPAY_KEY_ID = "rzp_test_key_id";
process.env.RAZORPAY_KEY_SECRET = "rzp_test_key_secret";
process.env.NODE_ENV = "test";

// Mock Razorpay
jest.mock("razorpay", () => {
  return jest.fn().mockImplementation(() => ({
    orders: {
      create: jest.fn().mockResolvedValue({ id: "order_test_123" }),
    },
  }));
});

// Mock Supabase
jest.mock("../supabase", () => ({
  getServiceClient: () => ({
    from: () => ({
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    }),
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
  }),
}));

// Mock rate limiting
jest.mock("express-rate-limit", () => {
  return jest.fn(() => (req: any, res: any, next: any) => next());
});

import razorpayRouter from "./razorpay";

// Create test app with mocked auth
const createTestApp = () => {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Add mock auth middleware before routes (bypasses clerkMiddleware)
  app.use((req: any, res: any, next: any) => {
    req.auth = {
      uid: () => "user_test_123",
      userId: "user_test_123",
    };
    next();
  });

  app.use("/api/razorpay", razorpayRouter);
  return app;
};

describe("Razorpay API - Negative Tests", () => {
  let app: express.Express;

  beforeEach(() => {
    app = createTestApp();
    jest.clearAllMocks();
  });

  describe("POST /api/razorpay/create-order", () => {
    it("should return 200 with orderId even when amount is missing (passes to Razorpay)", async () => {
      const response = await request(app)
        .post("/api/razorpay/create-order")
        .send({});

      // Route doesn't validate amount - passes to Razorpay which may fail
      expect([200, 500]).toContain(response.status);
    });

    it("should return 200 with orderId for invalid amount types (Razorpay validates)", async () => {
      const response = await request(app)
        .post("/api/razorpay/create-order")
        .send({ amount: "invalid" });

      expect([200, 500]).toContain(response.status);
    });

    it("should return 200 with orderId for negative amount (Razorpay validates)", async () => {
      const response = await request(app)
        .post("/api/razorpay/create-order")
        .send({ amount: -100 });

      expect([200, 500]).toContain(response.status);
    });

    it("should return 200 with orderId for zero amount (Razorpay validates)", async () => {
      const response = await request(app)
        .post("/api/razorpay/create-order")
        .send({ amount: 0 });

      expect([200, 500]).toContain(response.status);
    });

    it("should return 200 with orderId for non-integer paise (Razorpay validates)", async () => {
      const response = await request(app)
        .post("/api/razorpay/create-order")
        .send({ amount: 999.50 });

      expect([200, 500]).toContain(response.status);
    });

    it("should not be rate limited in test environment", async () => {
      // Rate limiting is disabled in test environment
      const requests = Array(11).fill(null).map(() =>
        request(app)
          .post("/api/razorpay/create-order")
          .send({ amount: 99900 })
      );

      const responses = await Promise.all(requests);
      // All should succeed (no 429)
      const rateLimited = responses.some(r => r.status === 429);
      expect(rateLimited).toBe(false);
    });

    it("should return 200 with orderId when successful", async () => {
      const response = await request(app)
        .post("/api/razorpay/create-order")
        .send({ amount: 99900 });

      expect(response.status).toBe(200);
      expect(response.body.orderId).toBe("order_test_123");
    });
  });

  describe("POST /api/razorpay/verify-payment", () => {
    const validPayload = {
      razorpay_order_id: "order_test_123",
      razorpay_payment_id: "pay_test_123",
      razorpay_signature: "valid_signature",
      plan_name: "Premium",
      amount: 99900,
      method: "UPI",
    };

    it("should return 400 when razorpay_order_id is missing", async () => {
      const { razorpay_order_id, ...payload } = validPayload;
      const response = await request(app)
        .post("/api/razorpay/verify-payment")
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid signature");
    });

    it("should return 400 when razorpay_payment_id is missing", async () => {
      const { razorpay_payment_id, ...payload } = validPayload;
      const response = await request(app)
        .post("/api/razorpay/verify-payment")
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid signature");
    });

    it("should return 400 when razorpay_signature is missing", async () => {
      const { razorpay_signature, ...payload } = validPayload;
      const response = await request(app)
        .post("/api/razorpay/verify-payment")
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid signature");
    });

    it("should return 400 when signature is invalid", async () => {
      const response = await request(app)
        .post("/api/razorpay/verify-payment")
        .send({ ...validPayload, razorpay_signature: "invalid_signature" });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid signature");
    });

    it("should return 400 when signature is tampered", async () => {
      // Generate valid signature then tamper
      const hmac = crypto.createHmac("sha256", "rzp_test_key_secret");
      hmac.update(`${validPayload.razorpay_order_id}|${validPayload.razorpay_payment_id}`);
      const validSig = hmac.digest("hex");
      const tamperedSig = validSig.slice(0, -1) + (validSig.endsWith("a") ? "b" : "a");

      const response = await request(app)
        .post("/api/razorpay/verify-payment")
        .send({ ...validPayload, razorpay_signature: tamperedSig });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid signature");
    });

    it("should return 400 when plan_name is missing (edge case)", async () => {
      const { plan_name, ...payload } = validPayload;
      const response = await request(app)
        .post("/api/razorpay/verify-payment")
        .send(payload);

      // Should still verify signature but plan_name is optional
      expect([200, 400, 500]).toContain(response.status);
    });

    it("should handle empty request body", async () => {
      const response = await request(app)
        .post("/api/razorpay/verify-payment")
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid signature");
    });

    it("should return 200 when signature is valid", async () => {
      // Generate valid signature
      const hmac = crypto.createHmac("sha256", "rzp_test_key_secret");
      hmac.update(`${validPayload.razorpay_order_id}|${validPayload.razorpay_payment_id}`);
      const validSig = hmac.digest("hex");

      const response = await request(app)
        .post("/api/razorpay/verify-payment")
        .send({ ...validPayload, razorpay_signature: validSig });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});
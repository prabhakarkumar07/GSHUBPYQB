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

// Mock rate limiting
jest.mock("express-rate-limit", () => {
  return jest.fn(() => (req: any, res: any, next: any) => next());
});

// Mock Supabase with configurable responses
const mockSupabase = {
  from: jest.fn(),
  rpc: jest.fn(),
};

jest.mock("../supabase", () => ({
  getServiceClient: () => mockSupabase,
}));

import premiumRouter from "./premium";

// Helper to generate valid signature
const generateValidSignature = (orderId: string, paymentId: string): string => {
  const hmac = crypto.createHmac("sha256", "rzp_test_key_secret");
  hmac.update(`${orderId}|${paymentId}`);
  return hmac.digest("hex");
};

// Helper to setup Supabase mock chain
const setupMockChain = (overrides: any = {}) => {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    insert: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: { id: "sub_123" }, error: null }),
      }),
    }),
    update: jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    }),
    ...overrides,
  };
  mockSupabase.from.mockReturnValue(chain);
  mockSupabase.rpc.mockResolvedValue({ data: null, error: null });
  return chain;
};

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

  app.use("/api/premium", premiumRouter);
  return app;
};

describe("Premium API - Negative Tests", () => {
  let app: express.Express;

  beforeEach(() => {
    app = createTestApp();
    jest.clearAllMocks();
  });

  describe("GET /api/premium/config", () => {
    it("should return 500 when Supabase query fails", async () => {
      setupMockChain({
        single: jest.fn().mockResolvedValue({ data: null, error: { message: "DB error" } }),
      });

      const response = await request(app).get("/api/premium/config");

      expect(response.status).toBe(500);
      expect(response.body.error).toBe("Failed to fetch premium config");
    });

    it("should return 200 with config when successful", async () => {
      setupMockChain({
        single: jest.fn().mockResolvedValue({ data: { enabled: true }, error: null }),
      });

      const response = await request(app).get("/api/premium/config");

      expect(response.status).toBe(200);
      expect(response.body.online).toBe(true);
    });

    it("should return 200 with online false when disabled", async () => {
      setupMockChain({
        single: jest.fn().mockResolvedValue({ data: { enabled: false }, error: null }),
      });

      const response = await request(app).get("/api/premium/config");

      expect(response.status).toBe(200);
      expect(response.body.online).toBe(false);
    });
  });

  describe("POST /api/premium/order", () => {
    const validOrderPayload = { plan: "monthly" };

    beforeEach(() => {
      // Default successful plan settings
      setupMockChain({
        single: jest.fn().mockResolvedValue({ data: { price_monthly: 999, price_yearly: 9999 }, error: null }),
      });
    });

    it("should return 400 when plan is missing", async () => {
      const response = await request(app)
        .post("/api/premium/order")
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid plan. Must be 'monthly' or 'yearly'");
    });

    it("should return 400 when plan is invalid", async () => {
      const response = await request(app)
        .post("/api/premium/order")
        .send({ plan: "weekly" });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid plan. Must be 'monthly' or 'yearly'");
    });

    it("should return 400 when plan is empty string", async () => {
      const response = await request(app)
        .post("/api/premium/order")
        .send({ plan: "" });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid plan. Must be 'monthly' or 'yearly'");
    });

    it("should return 400 when plan is null", async () => {
      const response = await request(app)
        .post("/api/premium/order")
        .send({ plan: null });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid plan. Must be 'monthly' or 'yearly'");
    });

    it("should return 500 when plan settings fetch fails", async () => {
      setupMockChain({
        single: jest.fn().mockResolvedValue({ data: null, error: { message: "Settings not found" } }),
      });

      const response = await request(app)
        .post("/api/premium/order")
        .send(validOrderPayload);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe("Failed to create premium order");
    });

    it("should apply coupon when valid", async () => {
      mockSupabase.rpc.mockResolvedValue({
        data: { monthly: { ok: true, final: 499 }, yearly: { ok: false } },
        error: null,
      });

      const response = await request(app)
        .post("/api/premium/order")
        .send({ plan: "monthly", coupon: "SAVE50" });

      expect(response.status).toBe(200);
      expect(response.body.coupon).toBe("SAVE50");
      expect(response.body.finalPrice).toBe(499);
    });

    it("should ignore invalid coupon", async () => {
      mockSupabase.rpc.mockResolvedValue({
        data: { monthly: { ok: false }, yearly: { ok: false } },
        error: null,
      });

      const response = await request(app)
        .post("/api/premium/order")
        .send({ plan: "monthly", coupon: "INVALID" });

      expect(response.status).toBe(200);
      expect(response.body.coupon).toBe("");
      expect(response.body.finalPrice).toBe(999);
    });

    it("should handle coupon RPC error", async () => {
      mockSupabase.rpc.mockResolvedValue({
        data: null,
        error: { message: "Coupon check failed" },
      });

      const response = await request(app)
        .post("/api/premium/order")
        .send({ plan: "monthly", coupon: "ERROR" });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe("Failed to create premium order");
    });

    it("should not be rate limited in test environment", async () => {
      // Rate limiting is disabled in test environment
      const requests = Array(11).fill(null).map(() =>
        request(app)
          .post("/api/premium/order")
          .send(validOrderPayload)
      );

      const responses = await Promise.all(requests);
      // All should succeed (no 429)
      const rateLimited = responses.some(r => r.status === 429);
      expect(rateLimited).toBe(false);
    });

    it("should return 200 with order details when successful", async () => {
      const response = await request(app)
        .post("/api/premium/order")
        .send(validOrderPayload);

      expect(response.status).toBe(200);
      expect(response.body.orderId).toBe("order_test_123");
      expect(response.body.keyId).toBe("rzp_test_key_id");
      expect(response.body.plan).toBe("monthly");
    });

    it("should return 500 when payment record insert fails", async () => {
      const chain = setupMockChain({
        single: jest.fn().mockResolvedValue({ data: { price_monthly: 999, price_yearly: 9999 }, error: null }),
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: null, error: { message: "Insert failed" } }),
          }),
        }),
      });

      const response = await request(app)
        .post("/api/premium/order")
        .send(validOrderPayload);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe("Failed to create premium order");
    });

    it("should handle yearly plan correctly", async () => {
      const response = await request(app)
        .post("/api/premium/order")
        .send({ plan: "yearly" });

      expect(response.status).toBe(200);
      expect(response.body.plan).toBe("yearly");
      expect(response.body.amount).toBe(999900); // 9999 * 100
    });

    it("should handle case insensitive coupon codes (stores uppercased, returns original)", async () => {
      mockSupabase.rpc.mockResolvedValue({
        data: { monthly: { ok: true, final: 499 }, yearly: { ok: false } },
        error: null,
      });

      const response = await request(app)
        .post("/api/premium/order")
        .send({ plan: "monthly", coupon: "save50" });

      expect(response.status).toBe(200);
      // Returns original coupon value, but stores uppercased internally
      expect(response.body.coupon).toBe("save50");
      expect(response.body.finalPrice).toBe(499);
    });

    it("should trim coupon whitespace for validation but return original", async () => {
      mockSupabase.rpc.mockResolvedValue({
        data: { monthly: { ok: true, final: 499 }, yearly: { ok: false } },
        error: null,
      });

      const response = await request(app)
        .post("/api/premium/order")
        .send({ plan: "monthly", coupon: "  SAVE50  " });

      expect(response.status).toBe(200);
      // Returns original coupon value (with whitespace)
      expect(response.body.coupon).toBe("  SAVE50  ");
      expect(response.body.finalPrice).toBe(499);
    });
  });

  describe("POST /api/premium/verify", () => {
    const validOrderId = "order_test_123";
    const validPaymentId = "pay_test_123";
    const validSignature = generateValidSignature(validOrderId, validPaymentId);
    const validVerifyPayload = {
      razorpay_order_id: validOrderId,
      razorpay_payment_id: validPaymentId,
      razorpay_signature: validSignature,
    };

    beforeEach(() => {
      // Mock payment record - default success
      setupMockChain({
        single: jest.fn().mockResolvedValue({
          data: {
            id: "payment_123",
            user_id: "user_test_123", // Matches mock auth
            plan: "monthly",
            amount_paise: 99900,
            razorpay_order_id: validOrderId,
            method: "UPI",
            coupon_code: null,
          },
          error: null,
        }),
      });
    });

    it("should return 400 when razorpay_order_id is missing", async () => {
      const { razorpay_order_id, ...payload } = validVerifyPayload;
      const response = await request(app)
        .post("/api/premium/verify")
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid signature");
    });

    it("should return 400 when razorpay_payment_id is missing", async () => {
      const { razorpay_payment_id, ...payload } = validVerifyPayload;
      const response = await request(app)
        .post("/api/premium/verify")
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid signature");
    });

    it("should return 400 when razorpay_signature is missing", async () => {
      const { razorpay_signature, ...payload } = validVerifyPayload;
      const response = await request(app)
        .post("/api/premium/verify")
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid signature");
    });

    it("should return 400 when signature is invalid", async () => {
      const response = await request(app)
        .post("/api/premium/verify")
        .send({ ...validVerifyPayload, razorpay_signature: "invalid" });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid signature");
    });

    it("should return 400 when signature is tampered", async () => {
      const tamperedSig = validSignature.slice(0, -1) + (validSignature.endsWith("a") ? "b" : "a");

      const response = await request(app)
        .post("/api/premium/verify")
        .send({ ...validVerifyPayload, razorpay_signature: tamperedSig });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid signature");
    });

    it("should return 500 when payment record not found", async () => {
      setupMockChain({
        single: jest.fn().mockResolvedValue({ data: null, error: { code: "PGRST116" } }), // Not found
      });

      const response = await request(app)
        .post("/api/premium/verify")
        .send(validVerifyPayload);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe("Failed to verify premium payment");
    });

    it("should return 403 when payment belongs to different user", async () => {
      setupMockChain({
        single: jest.fn().mockResolvedValue({
          data: {
            id: "payment_123",
            user_id: "other_user_456", // Different user!
            plan: "monthly",
            amount_paise: 99900,
            razorpay_order_id: validOrderId,
          },
          error: null,
        }),
      });

      const response = await request(app)
        .post("/api/premium/verify")
        .send(validVerifyPayload);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe("Payment does not belong to user");
    });

    it("should return 500 when payment update fails", async () => {
      setupMockChain({
        single: jest.fn().mockResolvedValue({
          data: {
            id: "payment_123",
            user_id: "user_test_123",
            plan: "monthly",
            amount_paise: 99900,
            razorpay_order_id: validOrderId,
          },
          error: null,
        }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: null, error: { message: "Update failed" } }),
        }),
      });

      const response = await request(app)
        .post("/api/premium/verify")
        .send(validVerifyPayload);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe("Failed to verify premium payment");
    });

    it("should return 500 when profile update fails", async () => {
      setupMockChain({
        single: jest.fn().mockResolvedValue({
          data: {
            id: "payment_123",
            user_id: "user_test_123",
            plan: "monthly",
            amount_paise: 99900,
            razorpay_order_id: validOrderId,
          },
          error: null,
        }),
        update: jest.fn()
          .mockReturnValueOnce({
            eq: jest.fn().mockResolvedValue({ data: null, error: null }), // payment update ok
          })
          .mockReturnValueOnce({
            eq: jest.fn().mockResolvedValue({ data: null, error: { message: "Profile update failed" } }), // profile update fails
          }),
      });

      const response = await request(app)
        .post("/api/premium/verify")
        .send(validVerifyPayload);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe("Failed to verify premium payment");
    });

    it("should return 500 when subscription insert fails", async () => {
      setupMockChain({
        single: jest.fn().mockResolvedValue({
          data: {
            id: "payment_123",
            user_id: "user_test_123",
            plan: "monthly",
            amount_paise: 99900,
            razorpay_order_id: validOrderId,
          },
          error: null,
        }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: null, error: null }),
        }),
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: null, error: { message: "Subscription insert failed" } }),
          }),
        }),
      });

      const response = await request(app)
        .post("/api/premium/verify")
        .send(validVerifyPayload);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe("Failed to verify premium payment");
    });

    it("should handle empty request body", async () => {
      const response = await request(app)
        .post("/api/premium/verify")
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid signature");
    });

    it("should calculate correct expiry for yearly plan", async () => {
      setupMockChain({
        single: jest.fn().mockResolvedValue({
          data: {
            id: "payment_123",
            user_id: "user_test_123",
            plan: "yearly",
            amount_paise: 999900,
            razorpay_order_id: validOrderId,
          },
          error: null,
        }),
      });

      const response = await request(app)
        .post("/api/premium/verify")
        .send(validVerifyPayload);

      expect(response.status).toBe(200);
      expect(response.body.until).toBeDefined();
      const until = new Date(response.body.until);
      const now = new Date();
      // Yearly should be ~1 year from now
      expect(until.getFullYear() - now.getFullYear()).toBe(1);
    });

    it("should calculate correct expiry for monthly plan", async () => {
      setupMockChain({
        single: jest.fn().mockResolvedValue({
          data: {
            id: "payment_123",
            user_id: "user_test_123",
            plan: "monthly",
            amount_paise: 99900,
            razorpay_order_id: validOrderId,
          },
          error: null,
        }),
      });

      const response = await request(app)
        .post("/api/premium/verify")
        .send(validVerifyPayload);

      expect(response.status).toBe(200);
      const until = new Date(response.body.until);
      const now = new Date();
      // Monthly should be ~1 month from now
      expect(until.getMonth() - now.getMonth()).toBe(1);
    });

    it("should return 200 with success when signature is valid", async () => {
      const response = await request(app)
        .post("/api/premium/verify")
        .send(validVerifyPayload);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.until).toBeDefined();
      expect(response.body.subscriptionId).toBe("sub_123");
    });
  });

  describe("GET /api/premium/test", () => {
    it("should return 200 with test message", async () => {
      const response = await request(app).get("/api/premium/test");

      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Premium route is working!");
    });
  });
});
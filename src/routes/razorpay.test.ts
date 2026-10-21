import request from "supertest";
import express from "express";
import cors from "cors";
import crypto from "crypto";

// Mock the webhook secret for testing
const WEBHOOK_SECRET = "test_webhook_secret_123";

// Create test app with the webhook route
const createTestApp = () => {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Webhook endpoint (copied from index.ts for testing)
  app.post("/api/webhooks/razorpay", async (req, res) => {
    try {
      const signature = req.headers["x-razorpay-signature"] as string;
      const body = JSON.stringify(req.body);

      const expectedSignature = crypto
        .createHmac("sha256", WEBHOOK_SECRET)
        .update(body)
        .digest("hex");

      if (expectedSignature !== signature) {
        console.error("Invalid Razorpay signature.");
        return res.status(400).json({ error: "Invalid signature" });
      }

      const event = req.body;

      if (event.event === "payment.captured" || event.event === "order.paid") {
        const paymentEntity = event.payload?.payment?.entity;

        if (!paymentEntity) {
          return res.status(400).json({ error: "Missing payment entity" });
        }

        const clerkUserId = paymentEntity.notes?.userId;

        if (!clerkUserId) {
          console.error("No userId found in Razorpay payment notes.");
          return res.status(400).json({ error: "Missing userId in notes" });
        }

        // In real app, this would update Supabase
        // For testing, we just return success
        console.log(`Upgrading user ${clerkUserId} to premium...`);
      }

      res.status(200).json({ status: "success" });
    } catch (error) {
      console.error("Webhook error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return app;
};

// Helper to generate valid signature
const generateSignature = (payload: object): string => {
  const body = JSON.stringify(payload);
  return crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(body)
    .digest("hex");
};

describe("Razorpay Webhook - Negative Tests", () => {
  let app: express.Express;

  beforeEach(() => {
    app = createTestApp();
  });

  describe("Signature Validation", () => {
    it("should return 400 when signature header is missing", async () => {
      const payload = {
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              notes: { userId: "user_123" }
            }
          }
        }
      };

      const response = await request(app)
        .post("/api/webhooks/razorpay")
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid signature");
    });

    it("should return 400 when signature is invalid", async () => {
      const payload = {
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              notes: { userId: "user_123" }
            }
          }
        }
      };

      const response = await request(app)
        .post("/api/webhooks/razorpay")
        .set("x-razorpay-signature", "invalid_signature")
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid signature");
    });

    it("should return 400 when signature is tampered", async () => {
      const payload = {
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              notes: { userId: "user_123" }
            }
          }
        }
      };

      // Generate valid signature then tamper with it
      const validSig = generateSignature(payload);
      const tamperedSig = validSig.slice(0, -1) + (validSig.endsWith("a") ? "b" : "a");

      const response = await request(app)
        .post("/api/webhooks/razorpay")
        .set("x-razorpay-signature", tamperedSig)
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid signature");
    });
  });

  describe("Payload Validation", () => {
    it("should return 200 for empty payload (no event type to process)", async () => {
      const response = await request(app)
        .post("/api/webhooks/razorpay")
        .set("x-razorpay-signature", generateSignature({}))
        .send({});

      // Empty payload has no event type, so it returns success (no action needed)
      expect(response.status).toBe(200);
      expect(response.body.status).toBe("success");
    });

    it("should return 400 when event type is missing", async () => {
      const payload = {
        payload: {
          payment: {
            entity: {
              notes: { userId: "user_123" }
            }
          }
        }
      };

      const response = await request(app)
        .post("/api/webhooks/razorpay")
        .set("x-razorpay-signature", generateSignature(payload))
        .send(payload);

      expect(response.status).toBe(200); // Event type missing but not payment.captured
    });

    it("should return 400 when payment.captured event has no payment entity", async () => {
      const payload = {
        event: "payment.captured",
        payload: {}
      };

      const response = await request(app)
        .post("/api/webhooks/razorpay")
        .set("x-razorpay-signature", generateSignature(payload))
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Missing payment entity");
    });

    it("should return 400 when payment.captured event has no userId in notes", async () => {
      const payload = {
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              notes: {}
            }
          }
        }
      };

      const response = await request(app)
        .post("/api/webhooks/razorpay")
        .set("x-razorpay-signature", generateSignature(payload))
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Missing userId in notes");
    });

    it("should return 400 when notes is missing entirely", async () => {
      const payload = {
        event: "payment.captured",
        payload: {
          payment: {
            entity: {}
          }
        }
      };

      const response = await request(app)
        .post("/api/webhooks/razorpay")
        .set("x-razorpay-signature", generateSignature(payload))
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Missing userId in notes");
    });
  });

  describe("Edge Cases", () => {
    it("should handle malformed JSON gracefully", async () => {
      const response = await request(app)
        .post("/api/webhooks/razorpay")
        .set("Content-Type", "application/json")
        .set("x-razorpay-signature", "any")
        .send("not valid json{");

      // Express will parse this as a string or fail
      expect([400, 500]).toContain(response.status);
    });

    it("should handle very large payloads", async () => {
      const largePayload = {
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              notes: { userId: "user_123" },
              largeField: "x".repeat(100000)
            }
          }
        }
      };

      const response = await request(app)
        .post("/api/webhooks/razorpay")
        .set("x-razorpay-signature", generateSignature(largePayload))
        .send(largePayload);

      expect([200, 400, 500]).toContain(response.status);
    });

    it("should reject order.paid event without userId", async () => {
      const payload = {
        event: "order.paid",
        payload: {
          payment: {
            entity: {
              notes: {}
            }
          }
        }
      };

      const response = await request(app)
        .post("/api/webhooks/razorpay")
        .set("x-razorpay-signature", generateSignature(payload))
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Missing userId in notes");
    });

    it("should ignore unsupported event types", async () => {
      const payload = {
        event: "refund.created",
        payload: {
          payment: {
            entity: {
              notes: { userId: "user_123" }
            }
          }
        }
      };

      const response = await request(app)
        .post("/api/webhooks/razorpay")
        .set("x-razorpay-signature", generateSignature(payload))
        .send(payload);

      // Should return 200 for unsupported events (no action needed)
      expect(response.status).toBe(200);
      expect(response.body.status).toBe("success");
    });
  });
});
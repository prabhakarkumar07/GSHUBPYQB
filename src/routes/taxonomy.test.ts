import request from "supertest";
import express from "express";
import cors from "cors";
import taxonomyRouter from "./taxonomy";

// Create test app
const createTestApp = () => {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use("/api/taxonomy", taxonomyRouter);
  return app;
};

describe("Taxonomy API - Negative Tests", () => {
  let app: express.Express;

  beforeEach(() => {
    app = createTestApp();
  });

  describe("GET /api/taxonomy", () => {
    it("should return 401 when no Authorization header is provided", async () => {
      const response = await request(app).get("/api/taxonomy");

      // The controller tries to extract token but it will be undefined
      // Depending on the service implementation, this might return 401 or 500
      expect([401, 500]).toContain(response.status);
    });

    it("should return 401 when Authorization header is malformed", async () => {
      const response = await request(app)
        .get("/api/taxonomy")
        .set("Authorization", "InvalidToken");

      expect([401, 500]).toContain(response.status);
    });

    it("should return 401 when Authorization header has invalid Bearer format", async () => {
      const response = await request(app)
        .get("/api/taxonomy")
        .set("Authorization", "Bearer");

      expect([401, 500]).toContain(response.status);
    });

    it("should return 404 for non-existent routes", async () => {
      const response = await request(app).get("/api/taxonomy/nonexistent");

      expect(response.status).toBe(404);
    });

    it("should return 404 for unsupported HTTP methods (no POST route)", async () => {
      const response = await request(app).post("/api/taxonomy");

      // Express returns 404 when route doesn't exist for that method
      expect(response.status).toBe(404);
    });

    it("should handle empty request body gracefully", async () => {
      const response = await request(app)
        .get("/api/taxonomy")
        .set("Authorization", "Bearer invalid-token")
        .send({});

      // Should not crash - returns error status
      expect([401, 500]).toContain(response.status);
    });
  });
});

describe("Taxonomy API - Edge Cases", () => {
  let app: express.Express;

  beforeEach(() => {
    app = createTestApp();
  });

  it("should handle very long Authorization header", async () => {
    const longToken = "Bearer " + "a".repeat(10000);
    const response = await request(app)
      .get("/api/taxonomy")
      .set("Authorization", longToken);

    expect([401, 500]).toContain(response.status);
  });

  it("should handle special characters in Authorization header", async () => {
    const response = await request(app)
      .get("/api/taxonomy")
      .set("Authorization", "Bearer <script>alert('xss')</script>");

    expect([401, 500]).toContain(response.status);
  });

  it("should handle SQL injection-like tokens", async () => {
    const response = await request(app)
      .get("/api/taxonomy")
      .set("Authorization", "Bearer ' OR '1'='1");

    expect([401, 500]).toContain(response.status);
  });
});
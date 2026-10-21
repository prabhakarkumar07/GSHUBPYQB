// Test setup file - runs before all tests
// Mock environment variables for testing
process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
process.env.RAZORPAY_WEBHOOK_SECRET = "test_webhook_secret_123";
process.env.FRONTEND_URL = "http://localhost:3000";
process.env.PORT = "8000";
process.env.CLERK_PUBLISHABLE_KEY = "pk_test_123";
process.env.CLERK_SECRET_KEY = "sk_test_123";

// Disable rate limiting for tests
process.env.NODE_ENV = "test";

// Suppress console.error during tests (optional)
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    // Only suppress specific expected errors
    if (args[0]?.includes?.("Invalid Razorpay signature") ||
        args[0]?.includes?.("No userId found") ||
        args[0]?.includes?.("Error in taxonomy controller") ||
        args[0]?.includes?.("Error fetching premium config") ||
        args[0]?.includes?.("Error creating premium order") ||
        args[0]?.includes?.("Error verifying premium payment") ||
        args[0]?.includes?.("Razorpay Order Error") ||
        args[0]?.includes?.("Payment Verification Error")) {
      return;
    }
    originalError(...args);
  };
});

afterAll(() => {
  console.error = originalError;
});
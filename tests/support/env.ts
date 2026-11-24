import "dotenv/config";

// Tests always use a dedicated database and fixed, non-production secrets.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/faceoff_test";
process.env.DIRECT_DATABASE_URL = "";
process.env.HOST_PASSWORD = "test-host-password";
process.env.SESSION_SECRET = "test-session-secret-test-session-secret-0123456789";
process.env.DATABASE_DRIVER = "pg";
process.env.OPENROUTER_API_KEY = "";
process.env.OPENROUTER_MODEL = "";

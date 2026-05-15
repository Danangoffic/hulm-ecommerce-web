// Set required env vars before any module is imported
process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-testing-purposes-only";
process.env.JWT_EXPIRES_IN = "1h";
process.env.NODE_ENV = "test";

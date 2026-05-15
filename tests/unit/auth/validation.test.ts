import { describe, it, expect } from "vitest";
import { registerSchema, loginSchema } from "@/lib/auth/validation";

// ── registerSchema ────────────────────────────────────────────────────────────

describe("registerSchema", () => {
  const valid = {
    name: "John Doe",
    email: "john@example.com",
    password: "Password1",
  };

  it("accepts valid input", () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects name shorter than 2 chars", () => {
    const result = registerSchema.safeParse({ ...valid, name: "J" });
    expect(result.success).toBe(false);
  });

  it("rejects name longer than 100 chars", () => {
    const result = registerSchema.safeParse({ ...valid, name: "A".repeat(101) });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = registerSchema.safeParse({ ...valid, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects password shorter than 8 chars", () => {
    const result = registerSchema.safeParse({ ...valid, password: "Pass1" });
    expect(result.success).toBe(false);
  });

  it("rejects password longer than 72 chars", () => {
    const result = registerSchema.safeParse({ ...valid, password: "A1" + "a".repeat(72) });
    expect(result.success).toBe(false);
  });

  it("rejects password without uppercase letter", () => {
    const result = registerSchema.safeParse({ ...valid, password: "password1" });
    expect(result.success).toBe(false);
  });

  it("rejects password without a number", () => {
    const result = registerSchema.safeParse({ ...valid, password: "PasswordOnly" });
    expect(result.success).toBe(false);
  });

  it("rejects missing fields", () => {
    expect(registerSchema.safeParse({}).success).toBe(false);
    expect(registerSchema.safeParse({ name: "John" }).success).toBe(false);
  });
});

// ── loginSchema ───────────────────────────────────────────────────────────────

describe("loginSchema", () => {
  const valid = { email: "john@example.com", password: "anypassword" };

  it("accepts valid input", () => {
    expect(loginSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = loginSchema.safeParse({ ...valid, email: "bad" });
    expect(result.success).toBe(false);
  });

  it("rejects empty password", () => {
    const result = loginSchema.safeParse({ ...valid, password: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing fields", () => {
    expect(loginSchema.safeParse({}).success).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { signToken, verifyToken, extractBearerToken } from "@/lib/auth/jwt";
import type { AuthUser } from "@/lib/auth/types";

const mockUser: AuthUser = {
  id: "user-123",
  email: "test@example.com",
  role: "customer",
};

describe("signToken", () => {
  it("returns a non-empty string", () => {
    const token = signToken(mockUser);
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
  });

  it("produces a valid JWT with three dot-separated parts", () => {
    const token = signToken(mockUser);
    expect(token.split(".")).toHaveLength(3);
  });
});

describe("verifyToken", () => {
  it("decodes a token signed by signToken", () => {
    const token = signToken(mockUser);
    const payload = verifyToken(token);

    expect(payload.sub).toBe(mockUser.id);
    expect(payload.email).toBe(mockUser.email);
    expect(payload.role).toBe(mockUser.role);
  });

  it("throws on a tampered token", () => {
    const token = signToken(mockUser);
    const tampered = token.slice(0, -4) + "xxxx";
    expect(() => verifyToken(tampered)).toThrow();
  });

  it("throws on a completely invalid string", () => {
    expect(() => verifyToken("not.a.token")).toThrow();
  });

  it("throws on an expired token", async () => {
    // Sign with 1ms expiry
    const { sign } = await import("jsonwebtoken");
    const expired = sign(
      { sub: "u1", email: "a@b.com", role: "customer" },
      process.env.JWT_SECRET!,
      { expiresIn: "1ms" }
    );
    // Wait for it to expire
    await new Promise((r) => setTimeout(r, 10));
    expect(() => verifyToken(expired)).toThrow();
  });

  it("includes iat and exp fields", () => {
    const token = signToken(mockUser);
    const payload = verifyToken(token);
    expect(payload.iat).toBeDefined();
    expect(payload.exp).toBeDefined();
    expect(payload.exp!).toBeGreaterThan(payload.iat!);
  });
});

describe("extractBearerToken", () => {
  it("extracts token from a valid Bearer header", () => {
    expect(extractBearerToken("Bearer mytoken123")).toBe("mytoken123");
  });

  it("returns null for missing header", () => {
    expect(extractBearerToken(null)).toBeNull();
  });

  it("returns null when prefix is not Bearer", () => {
    expect(extractBearerToken("Token mytoken123")).toBeNull();
    expect(extractBearerToken("Basic abc123")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractBearerToken("")).toBeNull();
  });

  it("handles Bearer with no token after space", () => {
    expect(extractBearerToken("Bearer ")).toBe("");
  });
});

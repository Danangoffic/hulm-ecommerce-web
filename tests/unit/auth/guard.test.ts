import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth/guard";
import { signToken } from "@/lib/auth/jwt";
import type { AuthUser } from "@/lib/auth/types";

function makeRequest(authHeader?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (authHeader) headers["authorization"] = authHeader;
  return new NextRequest("http://localhost/api/test", { headers });
}

function tokenFor(user: AuthUser): string {
  return `Bearer ${signToken(user)}`;
}

const customer: AuthUser = { id: "u1", email: "user@test.com", role: "customer" };
const admin: AuthUser    = { id: "u2", email: "admin@test.com", role: "admin" };
const superAdmin: AuthUser = { id: "u3", email: "super@test.com", role: "super_admin" };

// ── requireAuth ───────────────────────────────────────────────────────────────

describe("requireAuth", () => {
  it("returns ok:true with payload for a valid token", () => {
    const req = makeRequest(tokenFor(customer));
    const result = requireAuth(req);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.sub).toBe(customer.id);
      expect(result.payload.role).toBe("customer");
    }
  });

  it("returns ok:false with 401 when no Authorization header", async () => {
    const req = makeRequest();
    const result = requireAuth(req);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(401);
      const body = await result.error.json();
      expect(body.success).toBe(false);
      expect(body.error.message).toBe("Authentication required.");
    }
  });

  it("returns ok:false with 401 for a tampered token", async () => {
    const token = signToken(customer);
    const tampered = `Bearer ${token.slice(0, -4)}xxxx`;
    const req = makeRequest(tampered);
    const result = requireAuth(req);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(401);
    }
  });

  it("returns ok:false with 401 for an expired token", async () => {
    const { sign } = await import("jsonwebtoken");
    const expired = sign(
      { sub: "u1", email: "a@b.com", role: "customer" },
      process.env.JWT_SECRET!,
      { expiresIn: "1ms" }
    );
    await new Promise((r) => setTimeout(r, 10));
    const req = makeRequest(`Bearer ${expired}`);
    const result = requireAuth(req);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const body = await result.error.json();
      expect(body.error.message).toBe("Token expired.");
    }
  });
});

// ── requireRole ───────────────────────────────────────────────────────────────

describe("requireRole", () => {
  it("allows customer to access customer-level route", () => {
    const req = makeRequest(tokenFor(customer));
    const result = requireRole(req, "customer");
    expect(result.ok).toBe(true);
  });

  it("allows admin to access customer-level route", () => {
    const req = makeRequest(tokenFor(admin));
    const result = requireRole(req, "customer");
    expect(result.ok).toBe(true);
  });

  it("allows admin to access admin-level route", () => {
    const req = makeRequest(tokenFor(admin));
    const result = requireRole(req, "admin");
    expect(result.ok).toBe(true);
  });

  it("allows super_admin to access admin-level route", () => {
    const req = makeRequest(tokenFor(superAdmin));
    const result = requireRole(req, "admin");
    expect(result.ok).toBe(true);
  });

  it("blocks customer from admin-level route with 403", async () => {
    const req = makeRequest(tokenFor(customer));
    const result = requireRole(req, "admin");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(403);
      const body = await result.error.json();
      expect(body.error.message).toBe("Insufficient permissions.");
    }
  });

  it("blocks admin from super_admin-level route with 403", async () => {
    const req = makeRequest(tokenFor(admin));
    const result = requireRole(req, "super_admin");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(403);
    }
  });

  it("returns 401 when no token is provided", async () => {
    const req = makeRequest();
    const result = requireRole(req, "admin");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(401);
    }
  });
});

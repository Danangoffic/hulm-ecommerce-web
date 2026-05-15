import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { signToken } from "@/lib/auth/jwt";
import { sign } from "jsonwebtoken";
import { POST } from "@/app/api/auth/logout/route";

function makeRequest(authHeader?: string): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (authHeader) headers["authorization"] = authHeader;
  return new NextRequest("http://localhost/api/auth/logout", {
    method: "POST",
    headers,
  });
}

const validToken = signToken({ id: "u1", email: "a@b.com", role: "customer" });

describe("POST /api/auth/logout", () => {
  // ── Happy path ──────────────────────────────────────────────────────────────

  it("200 — valid token returns success message", async () => {
    const res = await POST(makeRequest(`Bearer ${validToken}`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.message).toContain("Logged out");
  });

  it("200 — expired token is treated as already logged out", async () => {
    const expired = sign(
      { sub: "u1", email: "a@b.com", role: "customer" },
      process.env.JWT_SECRET!,
      { expiresIn: "1ms" }
    );
    await new Promise((r) => setTimeout(r, 10));

    const res = await POST(makeRequest(`Bearer ${expired}`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.message).toBe("Logged out.");
  });

  // ── Missing / invalid token ─────────────────────────────────────────────────

  it("401 — no Authorization header", async () => {
    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("No token provided.");
  });

  it("401 — wrong scheme (Token instead of Bearer)", async () => {
    const res = await POST(makeRequest(`Token ${validToken}`));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error.message).toBe("No token provided.");
  });

  it("200 — tampered token is treated as already logged out", async () => {
    const tampered = `Bearer ${validToken.slice(0, -4)}xxxx`;
    const res = await POST(makeRequest(tampered));
    // Tampered = invalid = already logged out
    expect(res.status).toBe(200);
  });

  // ── Response shape ──────────────────────────────────────────────────────────

  it("success response has consistent shape: { success, data }", async () => {
    const res = await POST(makeRequest(`Bearer ${validToken}`));
    const body = await res.json();
    expect(body).toHaveProperty("success", true);
    expect(body).toHaveProperty("data");
  });

  it("error response has consistent shape: { success, error.message }", async () => {
    const res = await POST(makeRequest());
    const body = await res.json();
    expect(body).toHaveProperty("success", false);
    expect(body.error).toHaveProperty("message");
  });
});

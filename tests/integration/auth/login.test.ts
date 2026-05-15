import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    users: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 9, resetAt: Date.now() + 9999 })),
}));

import { POST } from "@/app/api/auth/login/route";
import { prisma } from "@/lib/prisma";

const mockPrisma = prisma as {
  users: { findFirst: ReturnType<typeof vi.fn> };
};

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const PLAIN_PASSWORD = "Password1";
let PASSWORD_HASH: string;

beforeEach(async () => {
  vi.clearAllMocks();
  PASSWORD_HASH = await bcrypt.hash(PLAIN_PASSWORD, 4); // low rounds for speed
});

const activeUser = () => ({
  id: "uuid-456",
  name: "John Doe",
  email: "john@example.com",
  role: "customer",
  is_active: true,
  password_hash: PASSWORD_HASH,
});

describe("POST /api/auth/login", () => {
  // ── Happy path ──────────────────────────────────────────────────────────────

  it("200 — returns token and user on valid credentials", async () => {
    mockPrisma.users.findFirst.mockResolvedValue(activeUser());

    const res = await POST(makeRequest({ email: "john@example.com", password: PLAIN_PASSWORD }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(typeof body.data.token).toBe("string");
    expect(body.data.token.split(".")).toHaveLength(3);
    expect(body.data.user.email).toBe("john@example.com");
  });

  it("200 — response does not expose password_hash", async () => {
    mockPrisma.users.findFirst.mockResolvedValue(activeUser());

    const res = await POST(makeRequest({ email: "john@example.com", password: PLAIN_PASSWORD }));
    const body = await res.json();

    expect(body.data.user).not.toHaveProperty("password_hash");
  });

  it("200 — X-RateLimit-Remaining header is set", async () => {
    mockPrisma.users.findFirst.mockResolvedValue(activeUser());

    const res = await POST(makeRequest({ email: "john@example.com", password: PLAIN_PASSWORD }));
    expect(res.headers.get("x-ratelimit-remaining")).toBe("9");
  });

  // ── Invalid credentials ─────────────────────────────────────────────────────

  it("401 — wrong password", async () => {
    mockPrisma.users.findFirst.mockResolvedValue(activeUser());

    const res = await POST(makeRequest({ email: "john@example.com", password: "WrongPass1" }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("Invalid email or password.");
  });

  it("401 — user not found (same message to prevent enumeration)", async () => {
    mockPrisma.users.findFirst.mockResolvedValue(null);

    const res = await POST(makeRequest({ email: "ghost@example.com", password: PLAIN_PASSWORD }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error.message).toBe("Invalid email or password.");
  });

  it("403 — account is disabled", async () => {
    mockPrisma.users.findFirst.mockResolvedValue({ ...activeUser(), is_active: false });

    const res = await POST(makeRequest({ email: "john@example.com", password: PLAIN_PASSWORD }));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error.message).toBe("Account is disabled.");
  });

  // ── Validation errors ───────────────────────────────────────────────────────

  it("422 — missing email", async () => {
    const res = await POST(makeRequest({ password: PLAIN_PASSWORD }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.details).toBeDefined();
  });

  it("422 — invalid email format", async () => {
    const res = await POST(makeRequest({ email: "bad", password: PLAIN_PASSWORD }));
    expect(res.status).toBe(422);
  });

  it("422 — empty password", async () => {
    const res = await POST(makeRequest({ email: "john@example.com", password: "" }));
    expect(res.status).toBe(422);
  });

  it("400 — malformed JSON", async () => {
    const req = new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // ── Rate limiting ───────────────────────────────────────────────────────────

  it("429 — rate limit exceeded", async () => {
    const { checkRateLimit } = await import("@/lib/auth/rate-limit");
    vi.mocked(checkRateLimit).mockReturnValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 9999,
    });

    const res = await POST(makeRequest({ email: "john@example.com", password: PLAIN_PASSWORD }));
    expect(res.status).toBe(429);
  });
});

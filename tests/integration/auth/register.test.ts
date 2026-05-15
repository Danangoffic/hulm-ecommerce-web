import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mock prisma before importing the route ────────────────────────────────────
vi.mock("@/lib/prisma", () => ({
  prisma: {
    users: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

// ── Mock rate limiter so it never blocks during tests ─────────────────────────
vi.mock("@/lib/auth/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 9, resetAt: Date.now() + 9999 })),
}));

import { POST } from "@/app/api/auth/register/route";
import { prisma } from "@/lib/prisma";

const mockPrisma = prisma as {
  users: {
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
};

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  name: "Jane Doe",
  email: "jane@example.com",
  password: "Password1",
};

const createdUser = {
  id: "uuid-123",
  name: "Jane Doe",
  email: "jane@example.com",
  role: "customer",
  created_at: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/auth/register", () => {
  // ── Happy path ──────────────────────────────────────────────────────────────

  it("201 — creates user and returns token", async () => {
    mockPrisma.users.findFirst.mockResolvedValue(null);
    mockPrisma.users.create.mockResolvedValue(createdUser);

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.user.email).toBe(validBody.email);
    expect(typeof body.data.token).toBe("string");
    expect(body.data.token.split(".")).toHaveLength(3);
  });

  it("201 — response does not expose password_hash", async () => {
    mockPrisma.users.findFirst.mockResolvedValue(null);
    mockPrisma.users.create.mockResolvedValue(createdUser);

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(body.data.user).not.toHaveProperty("password_hash");
  });

  it("201 — X-RateLimit-Remaining header is set", async () => {
    mockPrisma.users.findFirst.mockResolvedValue(null);
    mockPrisma.users.create.mockResolvedValue(createdUser);

    const res = await POST(makeRequest(validBody));
    expect(res.headers.get("x-ratelimit-remaining")).toBe("9");
  });

  // ── Validation errors ───────────────────────────────────────────────────────

  it("422 — missing name", async () => {
    const res = await POST(makeRequest({ email: "a@b.com", password: "Password1" }));
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("Validation failed.");
    expect(body.error.details).toBeDefined();
  });

  it("422 — invalid email", async () => {
    const res = await POST(makeRequest({ ...validBody, email: "not-email" }));
    expect(res.status).toBe(422);
  });

  it("422 — password too short", async () => {
    const res = await POST(makeRequest({ ...validBody, password: "Pass1" }));
    expect(res.status).toBe(422);
  });

  it("422 — password without uppercase", async () => {
    const res = await POST(makeRequest({ ...validBody, password: "password1" }));
    expect(res.status).toBe(422);
  });

  it("422 — password without number", async () => {
    const res = await POST(makeRequest({ ...validBody, password: "PasswordOnly" }));
    expect(res.status).toBe(422);
  });

  it("400 — malformed JSON body", async () => {
    const req = new NextRequest("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ bad json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toBe("Invalid JSON body.");
  });

  // ── Conflict ────────────────────────────────────────────────────────────────

  it("409 — email already registered", async () => {
    mockPrisma.users.findFirst.mockResolvedValue(createdUser);

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("Email already registered.");
  });

  // ── Rate limiting ───────────────────────────────────────────────────────────

  it("429 — rate limit exceeded", async () => {
    const { checkRateLimit } = await import("@/lib/auth/rate-limit");
    vi.mocked(checkRateLimit).mockReturnValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 9999,
    });

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error.message).toContain("Too many requests");
  });
});

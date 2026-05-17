import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as jwt from "jsonwebtoken";
import { Decimal } from "@prisma/client";

// ── Mocks ──────────────────────────────────────────────────────────────────
// Must be declared before any imports that use @/lib/prisma

vi.mock("@/lib/prisma", () => ({
  prisma: {
    orders: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { GET } from "@/app/api/orders/user/[userId]/route";
import { prisma } from "@/lib/prisma";

// ── Typed mock handles ─────────────────────────────────────────────────────

const mockOrders = prisma.orders as {
  findMany: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
};

// ── JWT helpers ────────────────────────────────────────────────────────────

const JWT_SECRET = "test-secret-that-is-long-enough-for-testing-purposes-only";

function signToken(
  payload: { sub: string; email: string; role: string },
  options: jwt.SignOptions = {}
): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "1h", ...options });
}

// ── UUIDs ──────────────────────────────────────────────────────────────────

const USER_ID   = "550e8400-e29b-41d4-a716-446655440001";
const OTHER_ID  = "550e8400-e29b-41d4-a716-446655440002";
const ADMIN_ID  = "550e8400-e29b-41d4-a716-446655440099";

const userToken  = signToken({ sub: USER_ID,  email: "user@example.com",  role: "customer" });
const otherToken = signToken({ sub: OTHER_ID, email: "other@example.com", role: "customer" });
const adminToken = signToken({ sub: ADMIN_ID, email: "admin@example.com", role: "admin" });

// ── Fixtures ───────────────────────────────────────────────────────────────

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-uuid-001",
    order_number: "ORD-20260517-A1B2C3",
    status: "pending_payment",
    currency: "IDR",
    total_amount: new Decimal("300000"),
    created_at: new Date("2026-05-17T10:00:00Z"),
    updated_at: new Date("2026-05-17T10:00:00Z"),
    _count: { order_items: 2 },
    ...overrides,
  };
}

// ── Request factory ────────────────────────────────────────────────────────

function makeRequest(
  userId: string,
  token?: string,
  searchParams: Record<string, string> = {}
): NextRequest {
  const url = new URL(`http://localhost/api/orders/user/${userId}`);
  for (const [key, value] of Object.entries(searchParams)) {
    url.searchParams.set(key, value);
  }

  const headers: Record<string, string> = {};
  if (token !== undefined) {
    headers["authorization"] = `Bearer ${token}`;
  }

  return new NextRequest(url.toString(), { method: "GET", headers });
}

// ── Default mock setup ─────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default: one order returned, total = 1
  mockOrders.findMany.mockResolvedValue([makeOrder()]);
  mockOrders.count.mockResolvedValue(1);
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("GET /api/orders/user/[userId]", () => {

  // ── Scenario 1: No Authorization header → 401 ─────────────────────────

  it("401 — no Authorization header", async () => {
    const res = await GET(
      makeRequest(USER_ID, undefined),
      { params: Promise.resolve({ userId: USER_ID }) }
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("Authentication required.");
  });

  // ── Scenario 2: Non-UUID userId param → 400 ───────────────────────────

  it("400 — non-UUID userId param", async () => {
    const res = await GET(
      makeRequest("not-a-uuid", userToken),
      { params: Promise.resolve({ userId: "not-a-uuid" }) }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("Invalid user ID format.");
  });

  // ── Scenario 3: Requester ≠ userId, non-admin → 403 ───────────────────

  it("403 — requester is not the owner and not admin", async () => {
    // otherToken has sub=OTHER_ID, but we're requesting USER_ID's orders
    const res = await GET(
      makeRequest(USER_ID, otherToken),
      { params: Promise.resolve({ userId: USER_ID }) }
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("Forbidden.");
  });

  // ── Scenario 4: Own orders, default pagination → 200, page=1, pageSize=10

  it("200 — own orders with default pagination returns page=1, pageSize=10", async () => {
    mockOrders.findMany.mockResolvedValue([makeOrder(), makeOrder({ id: "order-uuid-002" })]);
    mockOrders.count.mockResolvedValue(2);

    const res = await GET(
      makeRequest(USER_ID, userToken),
      { params: Promise.resolve({ userId: USER_ID }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.page).toBe(1);
    expect(body.data.pageSize).toBe(10);
    expect(body.data.total).toBe(2);
    expect(Array.isArray(body.data.orders)).toBe(true);
    expect(body.data.orders.length).toBe(2);

    // Each order should have item_count
    for (const order of body.data.orders) {
      expect(order).toHaveProperty("id");
      expect(order).toHaveProperty("order_number");
      expect(order).toHaveProperty("status");
      expect(order).toHaveProperty("currency");
      expect(order).toHaveProperty("total_amount");
      expect(order).toHaveProperty("created_at");
      expect(order).toHaveProperty("updated_at");
      expect(order).toHaveProperty("item_count");
    }
  });

  // ── Scenario 5: Custom page=2, pageSize=5 → correct skip/take applied ──

  it("200 — custom page=2, pageSize=5 calls findMany with skip=5, take=5", async () => {
    mockOrders.findMany.mockResolvedValue([]);
    mockOrders.count.mockResolvedValue(7);

    const res = await GET(
      makeRequest(USER_ID, userToken, { page: "2", pageSize: "5" }),
      { params: Promise.resolve({ userId: USER_ID }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.page).toBe(2);
    expect(body.data.pageSize).toBe(5);
    expect(body.data.total).toBe(7);

    // Verify findMany was called with correct skip and take
    expect(mockOrders.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 5,  // (page - 1) * pageSize = (2 - 1) * 5 = 5
        take: 5,
      })
    );
  });

  // ── Scenario 6: page=0 (invalid) → 400 ────────────────────────────────

  it("400 — page=0 is invalid (must be positive integer)", async () => {
    const res = await GET(
      makeRequest(USER_ID, userToken, { page: "0" }),
      { params: Promise.resolve({ userId: USER_ID }) }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("Invalid pagination parameters.");
  });

  // ── Scenario 7: pageSize=-1 (invalid) → 400 ───────────────────────────

  it("400 — pageSize=-1 is invalid (must be positive integer)", async () => {
    const res = await GET(
      makeRequest(USER_ID, userToken, { pageSize: "-1" }),
      { params: Promise.resolve({ userId: USER_ID }) }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("Invalid pagination parameters.");
  });

  // ── Scenario 8: Valid status filter → 200, all orders have that status ─

  it("200 — valid status filter returns only orders with that status", async () => {
    const filteredOrders = [
      makeOrder({ status: "paid" }),
      makeOrder({ id: "order-uuid-002", status: "paid" }),
    ];
    mockOrders.findMany.mockResolvedValue(filteredOrders);
    mockOrders.count.mockResolvedValue(2);

    const res = await GET(
      makeRequest(USER_ID, userToken, { status: "paid" }),
      { params: Promise.resolve({ userId: USER_ID }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.orders.length).toBe(2);

    // All returned orders must have the requested status
    for (const order of body.data.orders) {
      expect(order.status).toBe("paid");
    }

    // Verify findMany was called with the status filter in the where clause
    expect(mockOrders.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "paid" }),
      })
    );
  });

  // ── Scenario 9: Invalid status filter → 400 ───────────────────────────

  it("400 — invalid status filter value", async () => {
    const res = await GET(
      makeRequest(USER_ID, userToken, { status: "not_a_real_status" }),
      { params: Promise.resolve({ userId: USER_ID }) }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("Invalid status filter.");
  });

  // ── Scenario 10: Non-existent userId → 200, orders=[], total=0 ─────────

  it("200 — non-existent userId returns empty orders list with total=0", async () => {
    mockOrders.findMany.mockResolvedValue([]);
    mockOrders.count.mockResolvedValue(0);

    const res = await GET(
      makeRequest(USER_ID, userToken),
      { params: Promise.resolve({ userId: USER_ID }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.orders).toEqual([]);
    expect(body.data.total).toBe(0);
    expect(body.data.page).toBe(1);
    expect(body.data.pageSize).toBe(10);
  });

  // ── Scenario 11: Admin accesses another user's orders → 200 ───────────

  it("200 — admin can access another user's orders", async () => {
    // adminToken has sub=ADMIN_ID, role=admin; requesting USER_ID's orders
    const res = await GET(
      makeRequest(USER_ID, adminToken),
      { params: Promise.resolve({ userId: USER_ID }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.orders)).toBe(true);

    // Verify the query used the correct userId in the where clause
    expect(mockOrders.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ user_id: USER_ID }),
      })
    );
  });
});

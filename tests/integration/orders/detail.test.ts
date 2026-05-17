import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as jwt from "jsonwebtoken";
import { Decimal } from "@prisma/client";

// ── Mocks ──────────────────────────────────────────────────────────────────
// Must be declared before any imports that use @/lib/prisma

vi.mock("@/lib/prisma", () => ({
  prisma: {
    orders: {
      findUnique: vi.fn(),
    },
  },
}));

import { GET } from "@/app/api/orders/[id]/route";
import { prisma } from "@/lib/prisma";

// ── Typed mock handles ─────────────────────────────────────────────────────

const mockPrisma = prisma as {
  orders: { findUnique: ReturnType<typeof vi.fn> };
};

// ── JWT helpers ────────────────────────────────────────────────────────────

const JWT_SECRET = "test-secret-that-is-long-enough-for-testing-purposes-only";

function signToken(
  payload: { sub: string; email: string; role: string },
  options: jwt.SignOptions = { expiresIn: "1h" }
): string {
  return jwt.sign(payload, JWT_SECRET, options);
}

// ── Test UUIDs ─────────────────────────────────────────────────────────────

const ORDER_ID    = "550e8400-e29b-41d4-a716-446655440001";
const OWNER_ID    = "550e8400-e29b-41d4-a716-446655440002";
const OTHER_ID    = "550e8400-e29b-41d4-a716-446655440003";
const PRODUCT_ID  = "550e8400-e29b-41d4-a716-446655440004";
const ITEM_ID     = "550e8400-e29b-41d4-a716-446655440005";

const ownerToken = signToken({ sub: OWNER_ID, email: "owner@example.com", role: "customer" });
const otherToken = signToken({ sub: OTHER_ID, email: "other@example.com", role: "customer" });
const adminToken = signToken({ sub: OTHER_ID, email: "admin@example.com", role: "admin" });

// ── Fixtures ───────────────────────────────────────────────────────────────

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    order_number: "ORD-20260517-A1B2C3",
    status: "pending_payment",
    currency: "IDR",
    subtotal_amount: new Decimal("300000"),
    discount_amount: new Decimal("0"),
    shipping_amount: new Decimal("0"),
    total_amount: new Decimal("300000"),
    shipping_address_snapshot: {
      recipient_name: "Budi Santoso",
      phone: "08123456789",
      address_line1: "Jl. Merdeka No. 1",
      city: "Jakarta",
      province: "DKI Jakarta",
      postal_code: "10110",
    },
    shipping_courier: null,
    shipping_service: null,
    tracking_number: null,
    paid_at: null,
    created_at: new Date("2026-05-17T10:00:00Z"),
    updated_at: new Date("2026-05-17T10:00:00Z"),
    user_id: OWNER_ID,
    order_items: [
      {
        id: ITEM_ID,
        product_id: PRODUCT_ID,
        product_name_snapshot: "Kaos Polos",
        variant_snapshot: { id: "var-1", sku: "SKU-001", color: "hitam", size: "M" },
        quantity: 2,
        unit_price: new Decimal("150000"),
        line_total: new Decimal("300000"),
      },
    ],
    order_vouchers: {
      code_snapshot: "DISKON10",
      discount_amount: new Decimal("30000"),
    },
    ...overrides,
  };
}

// ── Request factory ────────────────────────────────────────────────────────

function makeRequest(id: string, token?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (token !== undefined) {
    headers["authorization"] = `Bearer ${token}`;
  }
  return new NextRequest(`http://localhost/api/orders/${id}`, { headers });
}

function makeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ── Default mock setup ─────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Default: return a full order owned by OWNER_ID with a voucher
  mockPrisma.orders.findUnique.mockResolvedValue(makeOrder());
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("GET /api/orders/[id]", () => {

  // ── Scenario 1: No Authorization header → 401 ─────────────────────────

  it("401 — no Authorization header", async () => {
    const res = await GET(makeRequest(ORDER_ID, undefined), makeCtx(ORDER_ID));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("Authentication required.");
  });

  // ── Scenario 2: Non-UUID id param → 400 ───────────────────────────────

  it("400 — non-UUID id param", async () => {
    const res = await GET(makeRequest("not-a-uuid", ownerToken), makeCtx("not-a-uuid"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("Invalid order ID format.");
  });

  // ── Scenario 3: Order not found (mock returns null) → 404 ─────────────

  it("404 — order not found", async () => {
    mockPrisma.orders.findUnique.mockResolvedValue(null);

    const res = await GET(makeRequest(ORDER_ID, ownerToken), makeCtx(ORDER_ID));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("Order not found.");
  });

  // ── Scenario 4: Non-owner, non-admin requester → 403 ──────────────────

  it("403 — non-owner, non-admin requester", async () => {
    // Order is owned by OWNER_ID; request comes from OTHER_ID with role=customer
    const res = await GET(makeRequest(ORDER_ID, otherToken), makeCtx(ORDER_ID));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("Forbidden.");
  });

  // ── Scenario 5: Owner retrieves own order → 200 with full response shape

  it("200 — owner retrieves own order with full response shape", async () => {
    const res = await GET(makeRequest(ORDER_ID, ownerToken), makeCtx(ORDER_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const d = body.data;
    // Top-level order fields
    expect(d).toHaveProperty("id", ORDER_ID);
    expect(d).toHaveProperty("order_number");
    expect(d).toHaveProperty("status");
    expect(d).toHaveProperty("currency");
    expect(d).toHaveProperty("subtotal_amount");
    expect(d).toHaveProperty("discount_amount");
    expect(d).toHaveProperty("shipping_amount");
    expect(d).toHaveProperty("total_amount");
    expect(d).toHaveProperty("shipping_address_snapshot");
    expect(d).toHaveProperty("shipping_courier");
    expect(d).toHaveProperty("shipping_service");
    expect(d).toHaveProperty("tracking_number");
    expect(d).toHaveProperty("paid_at");
    expect(d).toHaveProperty("created_at");
    expect(d).toHaveProperty("updated_at");

    // user_id must NOT be exposed in the response
    expect(d).not.toHaveProperty("user_id");

    // items array
    expect(Array.isArray(d.items)).toBe(true);
    expect(d.items.length).toBe(1);
    const item = d.items[0];
    expect(item).toHaveProperty("id");
    expect(item).toHaveProperty("product_id");
    expect(item).toHaveProperty("product_name_snapshot");
    expect(item).toHaveProperty("variant_snapshot");
    expect(item).toHaveProperty("quantity");
    expect(item).toHaveProperty("unit_price");
    // line_total is mapped to total_price in the response
    expect(item).toHaveProperty("total_price");
    expect(item).not.toHaveProperty("line_total");

    // voucher present
    expect(d.voucher).not.toBeNull();
    expect(d.voucher).toHaveProperty("code_snapshot");
    expect(d.voucher).toHaveProperty("discount_amount");
  });

  // ── Scenario 6: Admin retrieves any order → 200 ───────────────────────

  it("200 — admin retrieves order owned by another user", async () => {
    // adminToken has sub=OTHER_ID, role=admin; order is owned by OWNER_ID
    const res = await GET(makeRequest(ORDER_ID, adminToken), makeCtx(ORDER_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(ORDER_ID);
  });

  // ── Scenario 7: Order with no voucher → voucher: null ─────────────────

  it("200 — order with no voucher returns voucher: null", async () => {
    mockPrisma.orders.findUnique.mockResolvedValue(
      makeOrder({ order_vouchers: null })
    );

    const res = await GET(makeRequest(ORDER_ID, ownerToken), makeCtx(ORDER_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.voucher).toBeNull();
  });

  // ── Scenario 8: Error precedence — invalid UUID before 404 → 400 ──────

  it("400 — invalid UUID takes precedence over 404 (not 404)", async () => {
    // Even if findUnique would return null, the UUID check fires first
    mockPrisma.orders.findUnique.mockResolvedValue(null);

    const res = await GET(makeRequest("invalid-id-format", ownerToken), makeCtx("invalid-id-format"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("Invalid order ID format.");
    // Confirm prisma was never called (UUID check short-circuits)
    expect(mockPrisma.orders.findUnique).not.toHaveBeenCalled();
  });
});

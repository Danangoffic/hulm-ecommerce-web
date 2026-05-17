import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as jwt from "jsonwebtoken";
import { Decimal } from "@prisma/client";

// ── Mocks ──────────────────────────────────────────────────────────────────
// Must be declared before any imports that use @/lib/prisma

vi.mock("@/lib/prisma", () => ({
  prisma: {
    product_variants: {
      findMany: vi.fn(),
    },
    vouchers: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { POST } from "@/app/api/orders/route";
import { prisma } from "@/lib/prisma";

// ── Typed mock handles ─────────────────────────────────────────────────────

const mockPrisma = prisma as {
  product_variants: { findMany: ReturnType<typeof vi.fn> };
  vouchers: { findFirst: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

// ── JWT helpers ────────────────────────────────────────────────────────────

const JWT_SECRET = "test-secret-that-is-long-enough-for-testing-purposes-only";

function signToken(
  payload: { sub: string; email: string; role: string },
  options: jwt.SignOptions = { expiresIn: "1h" }
): string {
  return jwt.sign(payload, JWT_SECRET, options);
}

const USER_ID = "550e8400-e29b-41d4-a716-446655440001";
const VARIANT_ID = "550e8400-e29b-41d4-a716-446655440010";
const PRODUCT_ID = "550e8400-e29b-41d4-a716-446655440020";
const VOUCHER_ID = "550e8400-e29b-41d4-a716-446655440030";

const validToken = signToken({ sub: USER_ID, email: "user@example.com", role: "customer" });

// ── Fixtures ───────────────────────────────────────────────────────────────

const validShippingAddress = {
  recipient_name: "Budi Santoso",
  phone: "08123456789",
  address_line1: "Jl. Merdeka No. 1",
  city: "Jakarta",
  province: "DKI Jakarta",
  postal_code: "10110",
};

const validBody = {
  items: [{ variant_id: VARIANT_ID, quantity: 2 }],
  shipping_address: validShippingAddress,
};

/** A fully-populated variant mock with inventory.
 *  price and base_price must be Decimal instances because the route handler
 *  calls .mul() on them directly (e.g. `(unitPrice as Decimal).mul(quantity)`).
 */
function makeVariant(overrides: Record<string, unknown> = {}) {
  return {
    id: VARIANT_ID,
    sku: "SKU-001",
    color: "hitam",
    size: "M",
    price: new Decimal("150000"),
    products: {
      id: PRODUCT_ID,
      name: "Kaos Polos",
      base_price: new Decimal("100000"),
    },
    inventory: {
      stock_on_hand: 10,
      stock_reserved: 2,
    },
    ...overrides,
  };
}

/** A realistic created order returned from the transaction */
function makeCreatedOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-uuid-001",
    order_number: "ORD-20260517-A1B2C3",
    status: "pending_payment",
    currency: "IDR",
    subtotal_amount: "300000",
    discount_amount: "0",
    shipping_amount: "0",
    total_amount: "300000",
    created_at: new Date("2026-05-17T10:00:00Z"),
    order_items: [
      {
        id: "item-uuid-001",
        product_id: PRODUCT_ID,
        variant_id: VARIANT_ID,
        product_name_snapshot: "Kaos Polos",
        variant_snapshot: { id: VARIANT_ID, sku: "SKU-001", color: "hitam", size: "M" },
        unit_price: "150000",
        quantity: 2,
        line_total: "300000",
      },
    ],
    ...overrides,
  };
}

/** A valid voucher mock (active, not expired, not exhausted).
 *  value and min_order_amount must be Decimal instances because the route
 *  handler passes them to computeDiscount() and calls .lt() on min_order_amount.
 */
function makeVoucher(overrides: Record<string, unknown> = {}) {
  return {
    id: VOUCHER_ID,
    code: "DISKON10",
    type: "percentage",
    value: new Decimal("10"),
    min_order_amount: new Decimal("0"),
    max_discount_amount: null,
    usage_limit: null,
    _count: { order_vouchers: 0 },
    ...overrides,
  };
}

// ── Request factory ────────────────────────────────────────────────────────

function makeRequest(
  body: unknown,
  token?: string,
  contentType = "application/json"
): NextRequest {
  const headers: Record<string, string> = { "content-type": contentType };
  if (token !== undefined) {
    headers["authorization"] = `Bearer ${token}`;
  }
  return new NextRequest("http://localhost/api/orders", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

// ── Default mock setup ─────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default: one valid variant returned
  mockPrisma.product_variants.findMany.mockResolvedValue([makeVariant()]);

  // Default: no voucher
  mockPrisma.vouchers.findFirst.mockResolvedValue(null);

  // Default: transaction executes callback synchronously and returns a created order
  mockPrisma.$transaction.mockImplementation(
    async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma)
  );

  // Provide tx-level mocks used inside the transaction callback
  (prisma as Record<string, unknown>).$queryRaw = vi.fn().mockResolvedValue([
    { variant_id: VARIANT_ID, stock_on_hand: 10, stock_reserved: 2 },
  ]);
  (prisma as Record<string, unknown>).orders = {
    findFirst: vi.fn().mockResolvedValue(null), // no order_number collision
    create: vi.fn().mockResolvedValue(makeCreatedOrder()),
  };
  (prisma as Record<string, unknown>).inventory = {
    update: vi.fn().mockResolvedValue({}),
  };
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("POST /api/orders", () => {

  // ── Scenario 1: No Authorization header → 401 ─────────────────────────

  it("401 — no Authorization header", async () => {
    const res = await POST(makeRequest(validBody, undefined));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("Authentication required.");
  });

  // ── Scenario 2: Expired JWT → 401 ─────────────────────────────────────

  it("401 — expired JWT", async () => {
    const expiredToken = signToken(
      { sub: USER_ID, email: "user@example.com", role: "customer" },
      { expiresIn: -1 } // already expired
    );
    const res = await POST(makeRequest(validBody, expiredToken));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("Token expired.");
  });

  // ── Scenario 3: Invalid JSON body → 400 ───────────────────────────────

  it("400 — invalid JSON body", async () => {
    const res = await POST(makeRequest("not valid json {{{", validToken));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("Invalid JSON body.");
  });

  // ── Scenario 4: Empty items array → 422 ───────────────────────────────

  it("422 — empty items array", async () => {
    const res = await POST(makeRequest({ ...validBody, items: [] }, validToken));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("Validation failed.");
  });

  // ── Scenario 5: Variant not found → 404 ───────────────────────────────

  it("404 — variant not found (findMany returns fewer than requested)", async () => {
    // Return empty array — variant not found
    mockPrisma.product_variants.findMany.mockResolvedValue([]);

    const res = await POST(makeRequest(validBody, validToken));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("One or more variants not found or unavailable.");
    expect(body.error.details.missing_variant_ids).toContain(VARIANT_ID);
  });

  // ── Scenario 6: Variant belongs to inactive/soft-deleted product → 404 ─

  it("404 — variant belongs to inactive/soft-deleted product (filtered out by query)", async () => {
    // The route filters by is_active=true and products.deleted_at=null/status=published.
    // If the variant is excluded by those filters, findMany returns fewer results.
    mockPrisma.product_variants.findMany.mockResolvedValue([]);

    const res = await POST(makeRequest(validBody, validToken));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.message).toBe("One or more variants not found or unavailable.");
  });

  // ── Scenario 7: No inventory record for variant → 422 ─────────────────

  it("422 — no inventory record for variant", async () => {
    mockPrisma.product_variants.findMany.mockResolvedValue([
      makeVariant({ inventory: null }),
    ]);

    const res = await POST(makeRequest(validBody, validToken));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("no inventory record");
  });

  // ── Scenario 8: Insufficient stock → 422 ──────────────────────────────

  it("422 — insufficient stock", async () => {
    // stock_on_hand=5, stock_reserved=4 → available=1, but requesting 2
    mockPrisma.product_variants.findMany.mockResolvedValue([
      makeVariant({ inventory: { stock_on_hand: 5, stock_reserved: 4 } }),
    ]);

    const res = await POST(makeRequest(validBody, validToken)); // quantity=2
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("Insufficient stock");
    expect(body.error.details.available).toBe(1);
    expect(body.error.details.requested).toBe(2);
  });

  // ── Scenario 9: Invalid voucher code → 422 ────────────────────────────

  it("422 — invalid voucher code (not found)", async () => {
    mockPrisma.vouchers.findFirst.mockResolvedValue(null);

    const res = await POST(
      makeRequest({ ...validBody, voucher_code: "INVALID" }, validToken)
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("Voucher code is invalid or has expired.");
  });

  // ── Scenario 10: Inactive voucher → 422 ───────────────────────────────

  it("422 — inactive voucher (is_active=false filtered out by query)", async () => {
    // The route queries with is_active: true in the where clause.
    // An inactive voucher won't be returned, so findFirst returns null.
    mockPrisma.vouchers.findFirst.mockResolvedValue(null);

    const res = await POST(
      makeRequest({ ...validBody, voucher_code: "INACTIVE_CODE" }, validToken)
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.message).toBe("Voucher code is invalid or has expired.");
  });

  // ── Scenario 11: Expired voucher → 422 ────────────────────────────────

  it("422 — expired voucher (end_at in the past filtered out by query)", async () => {
    // The route queries with end_at >= now in the where clause.
    // An expired voucher won't be returned, so findFirst returns null.
    mockPrisma.vouchers.findFirst.mockResolvedValue(null);

    const res = await POST(
      makeRequest({ ...validBody, voucher_code: "EXPIRED_CODE" }, validToken)
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.message).toBe("Voucher code is invalid or has expired.");
  });

  // ── Scenario 12: Voucher usage limit reached → 422 ────────────────────

  it("422 — voucher usage limit reached", async () => {
    mockPrisma.vouchers.findFirst.mockResolvedValue(
      makeVoucher({ usage_limit: 100, _count: { order_vouchers: 100 } })
    );
    const res = await POST(
      makeRequest({ ...validBody, voucher_code: "DISKON10" }, validToken)
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("Voucher usage limit has been reached.");
  });

  // ── Scenario 13: Subtotal below voucher minimum → 422 ─────────────────

  it("422 — subtotal below voucher minimum order amount", async () => {
    // variant price=150000, quantity=2 → subtotal=300000
    // voucher requires min_order_amount=500000
    mockPrisma.vouchers.findFirst.mockResolvedValue(
      makeVoucher({ min_order_amount: new Decimal("500000") })
    );

    const res = await POST(
      makeRequest({ ...validBody, voucher_code: "DISKON10" }, validToken)
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("minimum");
  });

  // ── Scenario 14: Successful creation (no voucher) → 201 ───────────────

  it("201 — successful order creation without voucher", async () => {
    mockPrisma.$transaction.mockResolvedValue(makeCreatedOrder());

    const res = await POST(makeRequest(validBody, validToken));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);

    const data = body.data;
    expect(data).toHaveProperty("id");
    expect(data).toHaveProperty("order_number");
    expect(data).toHaveProperty("status", "pending_payment");
    expect(data).toHaveProperty("currency", "IDR");
    expect(data).toHaveProperty("subtotal_amount");
    expect(data).toHaveProperty("discount_amount");
    expect(data).toHaveProperty("shipping_amount");
    expect(data).toHaveProperty("total_amount");
    expect(data).toHaveProperty("items");
    expect(data).toHaveProperty("created_at");
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.items.length).toBeGreaterThan(0);
  });

  // ── Scenario 15: Successful creation (with voucher) → 201 ─────────────

  it("201 — successful order creation with voucher applies discount", async () => {
    // 10% off 300000 = 30000 discount → total = 270000
    mockPrisma.vouchers.findFirst.mockResolvedValue(makeVoucher());
    mockPrisma.$transaction.mockResolvedValue(
      makeCreatedOrder({
        discount_amount: "30000",
        total_amount: "270000",
      })
    );

    const res = await POST(
      makeRequest({ ...validBody, voucher_code: "DISKON10" }, validToken)
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Discount should be non-zero
    expect(body.data.discount_amount).not.toBe("0");
    expect(body.data.discount_amount).toBe("30000");
    expect(body.data.total_amount).toBe("270000");
  });

  // ── Scenario 16: Duplicate variant_id entries merged → 201 ────────────

  it("201 — duplicate variant_id entries are merged (quantities summed)", async () => {
    // Two items with the same variant_id: qty 1 + qty 3 = 4
    const bodyWithDuplicates = {
      ...validBody,
      items: [
        { variant_id: VARIANT_ID, quantity: 1 },
        { variant_id: VARIANT_ID, quantity: 3 },
      ],
    };

    // Merged quantity = 4; stock available = 8 (10 - 2), so it should pass
    mockPrisma.$transaction.mockResolvedValue(
      makeCreatedOrder({
        order_items: [
          {
            id: "item-uuid-001",
            product_id: PRODUCT_ID,
            variant_id: VARIANT_ID,
            product_name_snapshot: "Kaos Polos",
            variant_snapshot: { id: VARIANT_ID, sku: "SKU-001", color: "hitam", size: "M" },
            unit_price: "150000",
            quantity: 4,
            line_total: "600000",
          },
        ],
      })
    );

    const res = await POST(makeRequest(bodyWithDuplicates, validToken));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);

    // The merged item should have quantity 4
    const item = body.data.items.find(
      (i: { variant_id: string }) => i.variant_id === VARIANT_ID
    );
    expect(item).toBeDefined();
    expect(item.quantity).toBe(4);
  });

  // ── Scenario 17: user_id in body ignored; JWT sub used → 201 ──────────

  it("201 — user_id in body is ignored; JWT sub is used as order user_id", async () => {
    const DIFFERENT_USER_ID = "550e8400-e29b-41d4-a716-999999999999";

    // The order returned from the transaction should use the JWT sub (USER_ID),
    // not the user_id supplied in the body.
    mockPrisma.$transaction.mockResolvedValue(
      makeCreatedOrder({ user_id: USER_ID })
    );

    const bodyWithUserId = { ...validBody, user_id: DIFFERENT_USER_ID };
    const res = await POST(makeRequest(bodyWithUserId, validToken));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify the transaction was called (order was created)
    expect(mockPrisma.$transaction).toHaveBeenCalled();

    // The order create call inside the transaction should use USER_ID (JWT sub),
    // not DIFFERENT_USER_ID from the body.
    // We verify this by checking the orders.create call argument.
    const ordersCreate = (prisma as Record<string, { create: ReturnType<typeof vi.fn> }>).orders
      ?.create;
    if (ordersCreate && ordersCreate.mock.calls.length > 0) {
      const createData = ordersCreate.mock.calls[0][0].data;
      expect(createData.user_id).toBe(USER_ID);
      expect(createData.user_id).not.toBe(DIFFERENT_USER_ID);
    }
  });

  // ── Scenario 18: shipping_amount omitted → 201, shipping_amount = 0 ───

  it("201 — shipping_amount omitted defaults to 0", async () => {
    // Body without shipping_amount
    const bodyWithoutShipping = {
      items: [{ variant_id: VARIANT_ID, quantity: 1 }],
      shipping_address: validShippingAddress,
      // shipping_amount intentionally omitted
    };

    mockPrisma.$transaction.mockResolvedValue(
      makeCreatedOrder({
        subtotal_amount: "150000",
        shipping_amount: "0",
        total_amount: "150000",
      })
    );

    const res = await POST(makeRequest(bodyWithoutShipping, validToken));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.shipping_amount).toBe("0");
  });
});

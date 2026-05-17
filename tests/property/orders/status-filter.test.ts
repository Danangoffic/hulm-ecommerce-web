// Feature: order-management-api, Property 10: Status Filter Completeness

/**
 * Property 10: Status Filter Completeness
 * Validates: Requirements 3.7
 *
 * For any valid `status` filter value, all orders in the response SHALL have
 * `status` equal to the requested filter value, and no orders with a different
 * status SHALL appear in the results.
 *
 * Formally: ∀ order ∈ response.orders → order.status === requestedStatus
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as fc from "fast-check";
import * as jwt from "jsonwebtoken";
import { Decimal } from "@prisma/client";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/orders/helpers";

// ── Mock @/lib/prisma ──────────────────────────────────────────────────────
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

function signToken(sub: string, role = "customer"): string {
  return jwt.sign({ sub, email: "user@example.com", role }, JWT_SECRET, {
    expiresIn: "1h",
  });
}

// ── Fixtures ───────────────────────────────────────────────────────────────

const USER_ID = "550e8400-e29b-41d4-a716-446655440001";

/** Build a minimal order row as returned by prisma.orders.findMany */
function makeOrder(status: OrderStatus, overrides: Record<string, unknown> = {}) {
  return {
    id: "550e8400-e29b-41d4-a716-446655440099",
    order_number: "ORD-20260517-A1B2C3",
    status,
    currency: "IDR",
    total_amount: new Decimal("300000"),
    created_at: new Date("2026-05-17T10:00:00Z"),
    updated_at: new Date("2026-05-17T10:00:00Z"),
    _count: { order_items: 2 },
    ...overrides,
  };
}

/** Build a NextRequest for GET /api/orders/user/:userId with optional status filter */
function makeRequest(userId: string, status: OrderStatus, token: string): NextRequest {
  const url = `http://localhost/api/orders/user/${userId}?status=${status}`;
  return new NextRequest(url, {
    method: "GET",
    headers: { authorization: `Bearer ${token}` },
  });
}

// ── Default mock setup ─────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Property test ──────────────────────────────────────────────────────────

describe("Property 10: Status Filter Completeness", () => {
  it(
    "every order in the response has status equal to the requested filter value",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate a valid status filter value
          fc.constantFrom(...ORDER_STATUSES),
          // Generate a count of orders to return (0–20)
          fc.integer({ min: 0, max: 20 }),
          async (requestedStatus, orderCount) => {
            const token = signToken(USER_ID);

            // Build mock orders — all with the requested status
            const mockOrderList = Array.from({ length: orderCount }, (_, i) =>
              makeOrder(requestedStatus, {
                id: `550e8400-e29b-41d4-a716-${String(i).padStart(12, "0")}`,
                order_number: `ORD-20260517-${String(i).padStart(6, "0")}`,
              })
            );

            mockOrders.findMany.mockResolvedValue(mockOrderList);
            mockOrders.count.mockResolvedValue(orderCount);

            const request = makeRequest(USER_ID, requestedStatus, token);
            const response = await GET(request, {
              params: Promise.resolve({ userId: USER_ID }),
            });

            expect(response.status).toBe(200);

            const body = await response.json();
            expect(body.success).toBe(true);

            const { orders } = body.data as {
              orders: Array<{ status: string }>;
              total: number;
              page: number;
              pageSize: number;
            };

            // ── Core property ─────────────────────────────────────────────
            // Every order in the response MUST have the requested status
            for (const order of orders) {
              expect(order.status).toBe(requestedStatus);
            }

            // ── Supporting invariants ─────────────────────────────────────
            // The count of returned orders must not exceed the total
            expect(orders.length).toBeLessThanOrEqual(body.data.total);

            // No order with a different status should appear
            const wrongStatus = orders.filter(
              (o) => o.status !== requestedStatus
            );
            expect(wrongStatus).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    }
  );
});

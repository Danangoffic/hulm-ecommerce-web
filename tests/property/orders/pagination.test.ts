// Feature: order-management-api, Property 9: Pagination Correctness

/**
 * Property 9: Pagination Correctness
 * Validates: Requirements 3.4, 3.5
 *
 * For any valid (page, pageSize, total) combination, the returned `orders`
 * slice SHALL contain at most `pageSize` items, and the `total` field SHALL
 * reflect the total count of matching orders regardless of pagination.
 *
 * Formally:
 *   response.orders.length <= pageSize
 *   response.total === total (full count, unaffected by page/pageSize)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as jwt from "jsonwebtoken";

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
import * as fc from "fast-check";

// ── Typed mock handles ─────────────────────────────────────────────────────

const mockOrders = prisma.orders as {
  findMany: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
};

// ── JWT helpers ────────────────────────────────────────────────────────────

const JWT_SECRET = "test-secret-that-is-long-enough-for-testing-purposes-only";

function signToken(
  payload: { sub: string; email: string; role: string },
  options: jwt.SignOptions = { expiresIn: "1h" }
): string {
  return jwt.sign(payload, JWT_SECRET, options);
}

// ── Constants ──────────────────────────────────────────────────────────────

const USER_ID = "550e8400-e29b-41d4-a716-446655440001";

/** Build a minimal order stub that satisfies the route's response shaping. */
function makeOrderStub(index: number) {
  return {
    id: `550e8400-e29b-41d4-a716-4466554400${String(index).padStart(2, "0")}`,
    order_number: `ORD-20240101-${String(index).padStart(6, "0")}`,
    status: "pending_payment",
    currency: "IDR",
    total_amount: 100000,
    created_at: new Date("2024-01-01T00:00:00Z"),
    updated_at: new Date("2024-01-01T00:00:00Z"),
    _count: { order_items: 1 },
  };
}

// ── Property test ──────────────────────────────────────────────────────────

describe("Property 9: Pagination Correctness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it(
    "orders slice contains at most pageSize items and total equals full count regardless of page",
    async () => {
      const validToken = signToken({
        sub: USER_ID,
        email: "user@example.com",
        role: "customer",
      });

      await fc.assert(
        fc.asyncProperty(
          // pageSize ∈ [1, 100] — valid range per the route handler
          fc.integer({ min: 1, max: 100 }),
          // total ∈ [0, 500] — total matching orders in the DB
          fc.integer({ min: 0, max: 500 }),
          // page ∈ [1, 50] — always a valid positive integer
          fc.integer({ min: 1, max: 50 }),
          async (pageSize, total, page) => {
            // Compute how many items would actually be on this page:
            //   skip = (page - 1) * pageSize
            //   remaining = max(0, total - skip)
            //   slice = min(pageSize, remaining)
            const skip = (page - 1) * pageSize;
            const remaining = Math.max(0, total - skip);
            const sliceSize = Math.min(pageSize, remaining);

            // Build the slice that prisma.orders.findMany would return
            const ordersSlice = Array.from({ length: sliceSize }, (_, i) =>
              makeOrderStub(i)
            );

            mockOrders.findMany.mockResolvedValue(ordersSlice);
            mockOrders.count.mockResolvedValue(total);

            const url = new URL(
              `http://localhost/api/orders/user/${USER_ID}?page=${page}&pageSize=${pageSize}`
            );
            const request = new NextRequest(url, {
              headers: { Authorization: `Bearer ${validToken}` },
            });

            const response = await GET(request, {
              params: Promise.resolve({ userId: USER_ID }),
            });

            expect(response.status).toBe(200);

            const body = await response.json();
            expect(body.success).toBe(true);

            const data = body.data as {
              orders: unknown[];
              total: number;
              page: number;
              pageSize: number;
            };

            // ── Core invariant 1 ─────────────────────────────────────────
            // The returned slice must contain at most pageSize items
            expect(data.orders.length).toBeLessThanOrEqual(pageSize);

            // ── Core invariant 2 ─────────────────────────────────────────
            // total reflects the full count regardless of page/pageSize
            expect(data.total).toBe(total);

            // ── Supporting invariants ─────────────────────────────────────
            // The slice length matches what we computed above
            expect(data.orders.length).toBe(sliceSize);

            // page and pageSize are echoed back correctly
            expect(data.page).toBe(page);
            expect(data.pageSize).toBe(pageSize);
          }
        ),
        { numRuns: 100 }
      );
    }
  );
});

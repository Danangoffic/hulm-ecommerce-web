// Feature: order-management-api, Property 8: Ownership Access Control

/**
 * Property 8: Ownership Access Control
 * Validates: Requirements 2.4, 6.5
 *
 * For any order owned by user A, a GET /api/orders/:id request from user B
 * (where B ≠ A and B does not have admin role) SHALL always return HTTP 403.
 *
 * Formally: ∀ orderUserId, requesterId where orderUserId ≠ requesterId
 *   AND requester.role = "customer"
 *   → GET /api/orders/:id returns 403
 */

import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";
import * as jwt from "jsonwebtoken";
import { NextRequest } from "next/server";

// ── Mock @/lib/prisma ──────────────────────────────────────────────────────
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

// ── Typed mock handle ──────────────────────────────────────────────────────

const mockOrders = (prisma as { orders: { findUnique: ReturnType<typeof vi.fn> } }).orders;

// ── JWT helpers ────────────────────────────────────────────────────────────

const JWT_SECRET = "test-secret-that-is-long-enough-for-testing-purposes-only";

function signCustomerToken(sub: string): string {
  return jwt.sign(
    { sub, email: `${sub}@example.com`, role: "customer" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

// ── Request factory ────────────────────────────────────────────────────────

function makeGetRequest(orderId: string, token: string): NextRequest {
  return new NextRequest(`http://localhost/api/orders/${orderId}`, {
    method: "GET",
    headers: { authorization: `Bearer ${token}` },
  });
}

// ── Minimal order fixture ──────────────────────────────────────────────────

function makeOrder(userId: string) {
  return {
    id: "550e8400-e29b-41d4-a716-446655440001",
    order_number: "ORD-20260517-A1B2C3",
    status: "pending_payment",
    currency: "IDR",
    subtotal_amount: "100000",
    discount_amount: "0",
    shipping_amount: "0",
    total_amount: "100000",
    shipping_address_snapshot: {},
    shipping_courier: null,
    shipping_service: null,
    tracking_number: null,
    paid_at: null,
    created_at: new Date("2026-05-17T10:00:00Z"),
    updated_at: new Date("2026-05-17T10:00:00Z"),
    user_id: userId,
    order_items: [],
    order_vouchers: null,
  };
}

// ── Arbitrary: two distinct UUIDs ──────────────────────────────────────────
//
// Generate (orderUserId, requesterId) as a tuple of two UUIDs, then filter
// to ensure they are different. The probability of collision is negligible
// (UUID v4 has 2^122 possible values), so the filter will almost never
// discard a sample.

const distinctUuidPair = fc
  .tuple(fc.uuid(), fc.uuid())
  .filter(([orderUserId, requesterId]) => orderUserId !== requesterId);

// ── Property test ──────────────────────────────────────────────────────────

describe("Property 8: Ownership Access Control", () => {
  it(
    "non-admin requester whose sub ≠ order.user_id always receives 403",
    async () => {
      // A fixed valid UUID for the order ID (format must pass UUID validation)
      const ORDER_ID = "550e8400-e29b-41d4-a716-446655440001";

      await fc.assert(
        fc.asyncProperty(
          distinctUuidPair,
          async ([orderUserId, requesterId]) => {
            // Mock: order exists and is owned by orderUserId
            mockOrders.findUnique.mockResolvedValue(makeOrder(orderUserId));

            // Requester is a non-admin customer whose sub ≠ order.user_id
            const token = signCustomerToken(requesterId);
            const request = makeGetRequest(ORDER_ID, token);

            const response = await GET(request, {
              params: Promise.resolve({ id: ORDER_ID }),
            });

            expect(response.status).toBe(403);

            const body = await response.json();
            expect(body.success).toBe(false);
            expect(body.error.message).toBe("Forbidden.");
          }
        ),
        { numRuns: 100 }
      );
    }
  );
});

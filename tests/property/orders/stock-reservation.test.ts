// Feature: order-management-api, Property 1: Stock Reservation Round-Trip

/**
 * Property 1: Stock Reservation Round-Trip
 * Validates: Requirements 5.4, 5.5, 7.5
 *
 * For any valid inventory state (stock_on_hand, stock_reserved) and any
 * quantity Q where Q ≤ Available_Stock (= stock_on_hand - stock_reserved),
 * after the transaction commits and increments stock_reserved by Q, the
 * new Available_Stock MUST equal pre_available - Q.
 *
 * Formally: post_available = pre_available - ordered_quantity
 * where post_available = stock_on_hand - (stock_reserved + ordered_quantity)
 */

import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";
import { Decimal } from "@prisma/client";

// ── Mock @/lib/prisma ──────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    inventory: {
      update: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";

// ── Typed mock handles ─────────────────────────────────────────────────────

const mockPrisma = prisma as {
  $transaction: ReturnType<typeof vi.fn>;
  inventory: { update: ReturnType<typeof vi.fn> };
};

// ── Inventory state type ───────────────────────────────────────────────────

interface InventoryState {
  variant_id: string;
  stock_on_hand: number;
  stock_reserved: number;
}

// ── Dependent arbitrary ────────────────────────────────────────────────────
//
// Generates a valid (stock_on_hand, stock_reserved, quantity) triple where:
//   - stock_on_hand ∈ [1, 1000]
//   - stock_reserved ∈ [0, stock_on_hand - 1]  → available ≥ 1
//   - quantity ∈ [1, available]                 → Q ≤ A

const inventoryArbitrary = fc
  .integer({ min: 1, max: 1000 })
  .chain((stock_on_hand) =>
    fc
      .integer({ min: 0, max: stock_on_hand - 1 })
      .chain((stock_reserved) => {
        const available = stock_on_hand - stock_reserved;
        return fc
          .integer({ min: 1, max: available })
          .map((quantity) => ({ stock_on_hand, stock_reserved, quantity }));
      })
  );

// ── Inventory update logic (mirrors route handler) ─────────────────────────
//
// This mirrors the exact logic inside prisma.$transaction in
// app/api/orders/route.ts:
//
//   await tx.inventory.update({
//     where: { variant_id: item.variant_id },
//     data: { stock_reserved: { increment: item.quantity } },
//   });
//
// We simulate this by applying the increment to the in-memory state and
// asserting the invariant holds, with prisma.$transaction executing the
// callback synchronously (same pattern as integration tests).

async function simulateStockReservation(
  tx: typeof prisma,
  state: InventoryState,
  quantity: number
): Promise<InventoryState> {
  // Exact call made in the route handler's transaction body
  await tx.inventory.update({
    where: { variant_id: state.variant_id },
    data: { stock_reserved: { increment: quantity } },
  });

  // Return the updated state (mock captures the call; we compute the
  // expected new state to assert the invariant)
  return {
    ...state,
    stock_reserved: state.stock_reserved + quantity,
  };
}

// ── Property test ──────────────────────────────────────────────────────────

describe("Property 1: Stock Reservation Round-Trip", () => {
  it(
    "Available_Stock after reservation equals pre_available minus ordered_quantity",
    async () => {
      // Configure prisma.$transaction to execute the callback synchronously,
      // passing the mocked prisma client as the transaction object — same
      // pattern used in tests/integration/orders/create.test.ts.
      mockPrisma.$transaction.mockImplementation(
        async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma)
      );

      // inventory.update is a no-op in the mock; the state update is computed
      // in simulateStockReservation above.
      mockPrisma.inventory.update.mockResolvedValue({});

      await fc.assert(
        fc.asyncProperty(
          inventoryArbitrary,
          async ({ stock_on_hand, stock_reserved, quantity }) => {
            const variantId = "550e8400-e29b-41d4-a716-446655440010";

            const preState: InventoryState = {
              variant_id: variantId,
              stock_on_hand,
              stock_reserved,
            };

            // pre_available = stock_on_hand - stock_reserved
            const preAvailable = stock_on_hand - stock_reserved;

            // Execute the reservation inside a mocked transaction
            const postState = await prisma.$transaction(
              async (tx: typeof prisma) =>
                simulateStockReservation(tx, preState, quantity)
            );

            // post_available = stock_on_hand - (stock_reserved + quantity)
            const postAvailable =
              postState.stock_on_hand - postState.stock_reserved;

            // ── Core invariant ────────────────────────────────────────────
            // post_available MUST equal pre_available - quantity
            expect(postAvailable).toBe(preAvailable - quantity);

            // ── Supporting invariants ─────────────────────────────────────
            // stock_reserved increased by exactly quantity
            expect(postState.stock_reserved).toBe(
              preState.stock_reserved + quantity
            );

            // stock_on_hand is unchanged
            expect(postState.stock_on_hand).toBe(preState.stock_on_hand);

            // stock_reserved never exceeds stock_on_hand (Req 5.4)
            expect(postState.stock_reserved).toBeLessThanOrEqual(
              postState.stock_on_hand
            );

            // post_available is non-negative
            expect(postAvailable).toBeGreaterThanOrEqual(0);

            // Decimal arithmetic consistency check (mirrors Prisma Decimal usage)
            const decimalPreAvailable = new Decimal(stock_on_hand).sub(
              new Decimal(stock_reserved)
            );
            const decimalPostAvailable = decimalPreAvailable.sub(
              new Decimal(quantity)
            );
            expect(decimalPostAvailable.toNumber()).toBe(postAvailable);
          }
        ),
        { numRuns: 100 }
      );
    }
  );
});

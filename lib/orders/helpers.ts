import { Decimal } from "@prisma/client";

// ── Order number generation ────────────────────────────────────────────────

/**
 * Generate a unique order number.
 * Format: ORD-<YYYYMMDD>-<6 random uppercase hex chars>
 * e.g. ORD-20260517-A3F9C1
 */
export function generateOrderNumber(): string {
  const date = new Date();
  const datePart = date.toISOString().slice(0, 10).replaceAll("-", "");
  const randomPart = Math.random().toString(16).slice(2, 8).toUpperCase();
  return `ORD-${datePart}-${randomPart}`;
}

// ── Discount computation ───────────────────────────────────────────────────

/**
 * Compute the discount amount to apply to an order.
 *
 * Rules:
 *  - "percentage" type: discount = subtotal × (value / 100)
 *  - "flat" type: discount = value
 *  - Capped at max_discount_amount when set
 *  - Capped at subtotal (discount can never exceed what the customer owes)
 *
 * All arithmetic uses Decimal to avoid floating-point errors.
 */
export function computeDiscount(
  voucher: {
    type: string;
    value: Decimal;
    min_order_amount: Decimal;
    max_discount_amount: Decimal | null;
  },
  subtotal: Decimal
): Decimal {
  let discount: Decimal;

  if (voucher.type === "percentage") {
    // value is a percentage, e.g. 10 = 10 %
    discount = subtotal.mul(voucher.value).div(100);
  } else {
    // flat discount
    discount = new Decimal(voucher.value);
  }

  // Cap at max_discount_amount if set
  if (voucher.max_discount_amount !== null && discount.gt(voucher.max_discount_amount)) {
    discount = new Decimal(voucher.max_discount_amount);
  }

  // Discount cannot exceed the subtotal
  if (discount.gt(subtotal)) {
    discount = new Decimal(subtotal);
  }

  return discount;
}

// ── Order status definitions ───────────────────────────────────────────────

/** All valid order status values, in lifecycle order */
export const ORDER_STATUSES = [
  "pending_payment",
  "paid",
  "processing",
  "packed",
  "shipped",
  "completed",
  "cancelled",
  "expired",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

// ── Status transition map ──────────────────────────────────────────────────

/**
 * Valid status transitions: from → Set<to>
 *
 * Terminal states (completed, cancelled, expired) have empty sets —
 * no further transitions are permitted.
 */
export const VALID_TRANSITIONS: Record<OrderStatus, Set<OrderStatus>> = {
  pending_payment: new Set(["paid", "cancelled", "expired"]),
  paid: new Set(["processing", "cancelled"]),
  processing: new Set(["packed"]),
  packed: new Set(["shipped"]),
  shipped: new Set(["completed"]),
  completed: new Set(),
  cancelled: new Set(),
  expired: new Set(),
};

// ── Terminal statuses ──────────────────────────────────────────────────────

/** Orders in a terminal state cannot transition further */
export const TERMINAL_STATUSES = new Set<OrderStatus>([
  "completed",
  "cancelled",
  "expired",
]);

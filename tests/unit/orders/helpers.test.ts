import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client";
import {
  generateOrderNumber,
  computeDiscount,
  ORDER_STATUSES,
  VALID_TRANSITIONS,
  TERMINAL_STATUSES,
} from "@/lib/orders/helpers";

// ── generateOrderNumber ────────────────────────────────────────────────────

describe("generateOrderNumber", () => {
  // Validates: Requirements 4.2, 4.3, 4.6

  it("matches the expected format /^ORD-\\d{8}-[0-9A-F]{6}$/", () => {
    const orderNumber = generateOrderNumber();
    expect(orderNumber).toMatch(/^ORD-\d{8}-[0-9A-F]{6}$/);
  });

  it("generates unique values on successive calls", () => {
    const numbers = new Set(Array.from({ length: 20 }, () => generateOrderNumber()));
    // With 6 hex chars (16^6 = 16M possibilities), collisions in 20 calls are astronomically unlikely
    expect(numbers.size).toBeGreaterThan(1);
  });

  it("date part reflects today's date in YYYYMMDD format", () => {
    const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    const orderNumber = generateOrderNumber();
    expect(orderNumber.startsWith(`ORD-${today}-`)).toBe(true);
  });
});

// ── computeDiscount ────────────────────────────────────────────────────────

describe("computeDiscount", () => {
  // Validates: Requirements 4.2, 4.3, 4.6

  const baseVoucher = {
    type: "percentage",
    value: new Decimal(10),
    min_order_amount: new Decimal(0),
    max_discount_amount: null,
  };

  describe("percentage type", () => {
    it("computes 10% of subtotal correctly", () => {
      const subtotal = new Decimal(100000);
      const discount = computeDiscount({ ...baseVoucher, type: "percentage", value: new Decimal(10) }, subtotal);
      expect(discount.equals(new Decimal(10000))).toBe(true);
    });

    it("computes 25% of subtotal correctly", () => {
      const subtotal = new Decimal(200000);
      const discount = computeDiscount({ ...baseVoucher, type: "percentage", value: new Decimal(25) }, subtotal);
      expect(discount.equals(new Decimal(50000))).toBe(true);
    });

    it("computes 100% of subtotal correctly (full discount)", () => {
      const subtotal = new Decimal(50000);
      const discount = computeDiscount({ ...baseVoucher, type: "percentage", value: new Decimal(100) }, subtotal);
      expect(discount.equals(new Decimal(50000))).toBe(true);
    });
  });

  describe("flat type", () => {
    it("returns the flat value as discount", () => {
      const subtotal = new Decimal(200000);
      const discount = computeDiscount(
        { ...baseVoucher, type: "flat", value: new Decimal(30000) },
        subtotal
      );
      expect(discount.equals(new Decimal(30000))).toBe(true);
    });

    it("returns the flat value when it is less than subtotal", () => {
      const subtotal = new Decimal(500000);
      const discount = computeDiscount(
        { ...baseVoucher, type: "flat", value: new Decimal(50000) },
        subtotal
      );
      expect(discount.equals(new Decimal(50000))).toBe(true);
    });
  });

  describe("max_discount_amount cap", () => {
    it("caps percentage discount at max_discount_amount", () => {
      const subtotal = new Decimal(1000000);
      // 10% of 1,000,000 = 100,000 but capped at 50,000
      const discount = computeDiscount(
        { ...baseVoucher, type: "percentage", value: new Decimal(10), max_discount_amount: new Decimal(50000) },
        subtotal
      );
      expect(discount.equals(new Decimal(50000))).toBe(true);
    });

    it("does not cap when discount is below max_discount_amount", () => {
      const subtotal = new Decimal(100000);
      // 10% of 100,000 = 10,000 which is below cap of 50,000
      const discount = computeDiscount(
        { ...baseVoucher, type: "percentage", value: new Decimal(10), max_discount_amount: new Decimal(50000) },
        subtotal
      );
      expect(discount.equals(new Decimal(10000))).toBe(true);
    });

    it("caps flat discount at max_discount_amount", () => {
      const subtotal = new Decimal(500000);
      // flat 100,000 capped at 75,000
      const discount = computeDiscount(
        { ...baseVoucher, type: "flat", value: new Decimal(100000), max_discount_amount: new Decimal(75000) },
        subtotal
      );
      expect(discount.equals(new Decimal(75000))).toBe(true);
    });

    it("does not apply cap when max_discount_amount is null", () => {
      const subtotal = new Decimal(1000000);
      // 10% of 1,000,000 = 100,000 with no cap
      const discount = computeDiscount(
        { ...baseVoucher, type: "percentage", value: new Decimal(10), max_discount_amount: null },
        subtotal
      );
      expect(discount.equals(new Decimal(100000))).toBe(true);
    });
  });

  describe("discount-exceeds-subtotal cap", () => {
    it("caps flat discount at subtotal when flat value exceeds subtotal", () => {
      const subtotal = new Decimal(20000);
      const discount = computeDiscount(
        { ...baseVoucher, type: "flat", value: new Decimal(50000) },
        subtotal
      );
      expect(discount.equals(new Decimal(20000))).toBe(true);
    });

    it("caps percentage discount at subtotal when percentage > 100 would exceed it", () => {
      // This tests the subtotal cap as a safety net
      const subtotal = new Decimal(10000);
      // 200% would be 20,000 but capped at subtotal 10,000
      const discount = computeDiscount(
        { ...baseVoucher, type: "percentage", value: new Decimal(200) },
        subtotal
      );
      expect(discount.equals(new Decimal(10000))).toBe(true);
    });

    it("discount is exactly subtotal when flat equals subtotal", () => {
      const subtotal = new Decimal(30000);
      const discount = computeDiscount(
        { ...baseVoucher, type: "flat", value: new Decimal(30000) },
        subtotal
      );
      expect(discount.equals(new Decimal(30000))).toBe(true);
    });
  });
});

// ── VALID_TRANSITIONS ──────────────────────────────────────────────────────

describe("VALID_TRANSITIONS", () => {
  // Validates: Requirements 4.2, 4.3, 4.6

  it("covers all 8 order statuses as keys", () => {
    const keys = Object.keys(VALID_TRANSITIONS);
    expect(keys).toHaveLength(8);
    for (const status of ORDER_STATUSES) {
      expect(keys).toContain(status);
    }
  });

  it("terminal states (completed, cancelled, expired) have empty transition sets", () => {
    expect(VALID_TRANSITIONS.completed.size).toBe(0);
    expect(VALID_TRANSITIONS.cancelled.size).toBe(0);
    expect(VALID_TRANSITIONS.expired.size).toBe(0);
  });

  it("pending_payment can transition to paid, cancelled, expired", () => {
    expect(VALID_TRANSITIONS.pending_payment.has("paid")).toBe(true);
    expect(VALID_TRANSITIONS.pending_payment.has("cancelled")).toBe(true);
    expect(VALID_TRANSITIONS.pending_payment.has("expired")).toBe(true);
    expect(VALID_TRANSITIONS.pending_payment.size).toBe(3);
  });

  it("paid can transition to processing and cancelled", () => {
    expect(VALID_TRANSITIONS.paid.has("processing")).toBe(true);
    expect(VALID_TRANSITIONS.paid.has("cancelled")).toBe(true);
    expect(VALID_TRANSITIONS.paid.size).toBe(2);
  });

  it("processing can only transition to packed", () => {
    expect(VALID_TRANSITIONS.processing.has("packed")).toBe(true);
    expect(VALID_TRANSITIONS.processing.size).toBe(1);
  });

  it("packed can only transition to shipped", () => {
    expect(VALID_TRANSITIONS.packed.has("shipped")).toBe(true);
    expect(VALID_TRANSITIONS.packed.size).toBe(1);
  });

  it("shipped can only transition to completed", () => {
    expect(VALID_TRANSITIONS.shipped.has("completed")).toBe(true);
    expect(VALID_TRANSITIONS.shipped.size).toBe(1);
  });

  it("TERMINAL_STATUSES contains exactly completed, cancelled, and expired", () => {
    expect(TERMINAL_STATUSES.has("completed")).toBe(true);
    expect(TERMINAL_STATUSES.has("cancelled")).toBe(true);
    expect(TERMINAL_STATUSES.has("expired")).toBe(true);
    expect(TERMINAL_STATUSES.size).toBe(3);
  });

  it("all terminal statuses in TERMINAL_STATUSES have empty VALID_TRANSITIONS sets", () => {
    for (const status of TERMINAL_STATUSES) {
      expect(VALID_TRANSITIONS[status].size).toBe(0);
    }
  });
});

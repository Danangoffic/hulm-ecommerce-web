import { describe, it, expect } from "vitest";
import { createOrderSchema, shippingAddressSchema } from "@/lib/orders/validation";

// ── Helpers ────────────────────────────────────────────────────────────────

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

const validShippingAddress = {
  recipient_name: "Budi Santoso",
  phone: "08123456789",
  address_line1: "Jl. Merdeka No. 1",
  city: "Jakarta",
  province: "DKI Jakarta",
  postal_code: "10110",
};

const validMinimalPayload = {
  items: [{ variant_id: VALID_UUID, quantity: 1 }],
  shipping_address: validShippingAddress,
};

// ── createOrderSchema ──────────────────────────────────────────────────────

describe("createOrderSchema", () => {
  // Validates: Requirements 1.2, 7.1

  it("accepts valid minimal input (required fields only)", () => {
    const result = createOrderSchema.safeParse(validMinimalPayload);
    expect(result.success).toBe(true);
  });

  it("accepts valid full input (all optional fields populated)", () => {
    const result = createOrderSchema.safeParse({
      items: [{ variant_id: VALID_UUID, quantity: 2 }],
      shipping_address: { ...validShippingAddress, address_line2: "Lantai 3", country: "ID" },
      voucher_code: "DISKON10",
      shipping_courier: "JNE",
      shipping_service: "REG",
      shipping_amount: 15000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing items field", () => {
    const { items: _, ...rest } = validMinimalPayload;
    const result = createOrderSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects empty items array", () => {
    const result = createOrderSchema.safeParse({ ...validMinimalPayload, items: [] });
    expect(result.success).toBe(false);
  });

  it("rejects quantity = 0 (boundary: must be ≥ 1)", () => {
    const result = createOrderSchema.safeParse({
      ...validMinimalPayload,
      items: [{ variant_id: VALID_UUID, quantity: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts quantity = 1 (boundary: minimum valid value)", () => {
    const result = createOrderSchema.safeParse({
      ...validMinimalPayload,
      items: [{ variant_id: VALID_UUID, quantity: 1 }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects variant_id that is not a UUID", () => {
    const result = createOrderSchema.safeParse({
      ...validMinimalPayload,
      items: [{ variant_id: "not-a-uuid", quantity: 1 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing shipping_address", () => {
    const { shipping_address: _, ...rest } = validMinimalPayload;
    const result = createOrderSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("defaults shipping_amount to 0 when omitted", () => {
    const result = createOrderSchema.safeParse(validMinimalPayload);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.shipping_amount).toBe(0);
  });

  it("passes when voucher_code is omitted (optional)", () => {
    const result = createOrderSchema.safeParse(validMinimalPayload);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.voucher_code).toBeUndefined();
  });
});

// ── shippingAddressSchema ──────────────────────────────────────────────────

describe("shippingAddressSchema", () => {
  // Validates: Requirements 1.2, 7.1

  it("accepts valid full address", () => {
    const result = shippingAddressSchema.safeParse(validShippingAddress);
    expect(result.success).toBe(true);
  });

  it("defaults country to 'ID' when omitted", () => {
    const result = shippingAddressSchema.safeParse(validShippingAddress);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.country).toBe("ID");
  });

  it("rejects missing recipient_name", () => {
    const { recipient_name: _, ...rest } = validShippingAddress;
    const result = shippingAddressSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects missing phone", () => {
    const { phone: _, ...rest } = validShippingAddress;
    const result = shippingAddressSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects missing address_line1", () => {
    const { address_line1: _, ...rest } = validShippingAddress;
    const result = shippingAddressSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects missing city", () => {
    const { city: _, ...rest } = validShippingAddress;
    const result = shippingAddressSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects missing province", () => {
    const { province: _, ...rest } = validShippingAddress;
    const result = shippingAddressSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects missing postal_code", () => {
    const { postal_code: _, ...rest } = validShippingAddress;
    const result = shippingAddressSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

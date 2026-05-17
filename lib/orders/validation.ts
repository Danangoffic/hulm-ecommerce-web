import { z } from "zod";

// ── Line item schema ───────────────────────────────────────────────────────

export const orderItemSchema = z.object({
  /** The product variant being ordered */
  variant_id: z.string().pipe(z.uuid()),
  /** Quantity must be at least 1 */
  quantity: z.number().int().positive("quantity must be a positive integer"),
});

export type OrderItemInput = z.infer<typeof orderItemSchema>;

// ── Shipping address schema ────────────────────────────────────────────────

export const shippingAddressSchema = z.object({
  recipient_name: z.string().min(1, "recipient_name is required").max(200),
  phone: z.string().min(1, "phone is required").max(30),
  address_line1: z.string().min(1, "address_line1 is required").max(300),
  address_line2: z.string().max(300).optional().nullable(),
  city: z.string().min(1, "city is required").max(100),
  province: z.string().min(1, "province is required").max(100),
  postal_code: z.string().min(1, "postal_code is required").max(20),
  country: z.string().length(2, "country must be a 2-letter ISO code").optional().default("ID"),
});

export type ShippingAddressInput = z.infer<typeof shippingAddressSchema>;

// ── Create order schema ────────────────────────────────────────────────────

export const createOrderSchema = z.object({
  /** At least one line item required */
  items: z
    .array(orderItemSchema)
    .min(1, "at least one item is required"),

  /** Shipping address — required at order creation */
  shipping_address: shippingAddressSchema,

  /** Optional voucher code to apply */
  voucher_code: z.string().max(100).optional().nullable(),

  /** Optional shipping details */
  shipping_courier: z.string().max(100).optional().nullable(),
  shipping_service: z.string().max(100).optional().nullable(),
  shipping_amount: z.number().nonnegative().optional().default(0),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

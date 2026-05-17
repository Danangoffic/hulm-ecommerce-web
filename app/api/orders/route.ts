import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSuccess, apiError } from "@/lib/auth/response";
import { requireAuth } from "@/lib/auth/guard";
import { createOrderSchema } from "@/lib/orders/validation";
import { generateOrderNumber, computeDiscount } from "@/lib/orders/helpers";
import { Decimal } from "@prisma/client";

// ── POST /api/orders ───────────────────────────────────────────────────────
// Auth required (any authenticated user).
//
// Body (application/json):
//   {
//     items: [{ variant_id: uuid, quantity: number }],
//     shipping_address: { recipient_name, phone, address_line1, address_line2?,
//                         city, province, postal_code, country? },
//     voucher_code?: string,
//     shipping_courier?: string,
//     shipping_service?: string,
//     shipping_amount?: number,
//   }
//
// Behaviour:
//   1. Validates JWT — 401 if missing/invalid.
//   2. Validates request body — 422 on schema errors.
//   3. Fetches each variant (with product + inventory) — 404 if any not found.
//   4. Checks available stock (stock_on_hand - stock_reserved) — 422 if insufficient.
//   5. Optionally validates voucher — 422 if invalid/expired/exhausted.
//   6. Inside a serializable transaction:
//      a. Re-checks stock with SELECT FOR UPDATE to prevent races.
//      b. Creates the order record.
//      c. Creates order_items with price + name snapshots.
//      d. Increments inventory.stock_reserved for each variant.
//      e. Creates order_vouchers record if a voucher was applied.
//   7. Returns 201 with order id, order_number, total_amount, and item summary.

export async function POST(request: NextRequest) {
  // ── 1. Auth ──────────────────────────────────────────────────────────────
  const guard = requireAuth(request);
  if (!guard.ok) return guard.error;

  const userId = guard.payload.sub;

  // ── 2. Parse & validate body ─────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body.", 400);
  }

  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Validation failed.", 422, parsed.error.flatten().fieldErrors);
  }

  const {
    items,
    shipping_address,
    voucher_code,
    shipping_courier,
    shipping_service,
    shipping_amount: shippingAmountInput,
  } = parsed.data;

  // Deduplicate items by variant_id — merge quantities for the same variant
  const itemMap = new Map<string, number>();
  for (const item of items) {
    itemMap.set(item.variant_id, (itemMap.get(item.variant_id) ?? 0) + item.quantity);
  }
  const deduplicatedItems = Array.from(itemMap.entries()).map(([variant_id, quantity]) => ({
    variant_id,
    quantity,
  }));

  // ── 3. Fetch variants with product + inventory ───────────────────────────
  const variantIds = deduplicatedItems.map((i) => i.variant_id);

  const variants = await prisma.product_variants.findMany({
    where: {
      id: { in: variantIds },
      is_active: true,
      products: {
        deleted_at: null,
        status: "published",
        is_active: true,
      },
    },
    select: {
      id: true,
      sku: true,
      color: true,
      size: true,
      price: true,
      products: {
        select: {
          id: true,
          name: true,
          base_price: true,
        },
      },
      inventory: {
        select: {
          stock_on_hand: true,
          stock_reserved: true,
        },
      },
    },
  });

  // Ensure every requested variant was found
  if (variants.length !== variantIds.length) {
    const foundIds = new Set(variants.map((v) => v.id));
    const missing = variantIds.filter((id) => !foundIds.has(id));
    return apiError(
      "One or more variants not found or unavailable.",
      404,
      { missing_variant_ids: missing }
    );
  }

  // ── 4. Stock validation ──────────────────────────────────────────────────
  const variantMap = new Map(variants.map((v) => [v.id, v]));

  for (const item of deduplicatedItems) {
    const variant = variantMap.get(item.variant_id)!;
    const inv = variant.inventory;

    if (!inv) {
      return apiError(
        `Variant ${item.variant_id} has no inventory record.`,
        422
      );
    }

    const available = inv.stock_on_hand - inv.stock_reserved;
    if (available < item.quantity) {
      return apiError(
        `Insufficient stock for variant ${item.variant_id} (${variant.products.name} — ${variant.color} / ${variant.size}). Available: ${available}, requested: ${item.quantity}.`,
        422,
        {
          variant_id: item.variant_id,
          available,
          requested: item.quantity,
        }
      );
    }
  }

  // ── 5. Voucher validation (optional) ─────────────────────────────────────
  let voucherRecord: {
    id: string;
    code: string;
    type: string;
    value: Decimal;
    min_order_amount: Decimal;
    max_discount_amount: Decimal | null;
    usage_limit: number | null;
    _count: { order_vouchers: number };
  } | null = null;

  if (voucher_code) {
    const now = new Date();

    voucherRecord = await prisma.vouchers.findFirst({
      where: {
        code: voucher_code,
        is_active: true,
        OR: [{ start_at: null }, { start_at: { lte: now } }],
        AND: [
          { OR: [{ end_at: null }, { end_at: { gte: now } }] },
        ],
      },
      select: {
        id: true,
        code: true,
        type: true,
        value: true,
        min_order_amount: true,
        max_discount_amount: true,
        usage_limit: true,
        _count: { select: { order_vouchers: true } },
      },
    });

    if (!voucherRecord) {
      return apiError("Voucher code is invalid or has expired.", 422);
    }

    if (
      voucherRecord.usage_limit !== null &&
      voucherRecord._count.order_vouchers >= voucherRecord.usage_limit
    ) {
      return apiError("Voucher usage limit has been reached.", 422);
    }
  }

  // ── 6. Compute totals ─────────────────────────────────────────────────────
  // Unit price = variant.price ?? product.base_price (server-side, never trust client)
  const lineItems = deduplicatedItems.map((item) => {
    const variant = variantMap.get(item.variant_id)!;
    const unitPrice = variant.price ?? variant.products.base_price;
    const lineTotal = (unitPrice as Decimal).mul(item.quantity);

    return {
      variant_id: item.variant_id,
      product_id: variant.products.id,
      quantity: item.quantity,
      unit_price: unitPrice as Decimal,
      line_total: lineTotal,
      product_name_snapshot: variant.products.name,
      variant_snapshot: {
        id: variant.id,
        sku: variant.sku,
        color: variant.color,
        size: variant.size,
      },
    };
  });

  const subtotalAmount = lineItems.reduce(
    (sum, li) => sum.add(li.line_total),
    new Decimal(0)
  );

  const shippingAmount = new Decimal(shippingAmountInput ?? 0);

  // Compute discount from voucher
  let discountAmount = new Decimal(0);
  if (voucherRecord) {
    if (subtotalAmount.lt(voucherRecord.min_order_amount)) {
      return apiError(
        `Order subtotal does not meet the minimum required for this voucher (min: ${voucherRecord.min_order_amount}).`,
        422
      );
    }

    discountAmount = computeDiscount(voucherRecord, subtotalAmount);
  }

  const totalAmount = subtotalAmount.add(shippingAmount).sub(discountAmount);

  // ── 7. Persist inside a transaction ──────────────────────────────────────
  const order = await prisma.$transaction(async (tx) => {
    // Re-check stock with row-level lock to prevent race conditions
    const lockedInventory = await tx.$queryRaw<
      { variant_id: string; stock_on_hand: number; stock_reserved: number }[]
    >`
      SELECT variant_id, stock_on_hand, stock_reserved
      FROM inventory
      WHERE variant_id = ANY(${variantIds}::uuid[])
      FOR UPDATE
    `;

    const lockedMap = new Map(lockedInventory.map((r) => [r.variant_id, r]));

    for (const item of deduplicatedItems) {
      const inv = lockedMap.get(item.variant_id);
      if (!inv) {
        throw new Error(`Inventory record missing for variant ${item.variant_id}.`);
      }
      const available = inv.stock_on_hand - inv.stock_reserved;
      if (available < item.quantity) {
        const variant = variantMap.get(item.variant_id)!;
        throw new Error(
          `Insufficient stock for variant ${item.variant_id} (${variant.products.name} — ${variant.color} / ${variant.size}). Available: ${available}, requested: ${item.quantity}.`
        );
      }
    }

    // Generate a unique order number (retry once on collision)
    let orderNumber = generateOrderNumber();
    const collision = await tx.orders.findFirst({ where: { order_number: orderNumber } });
    if (collision) {
      orderNumber = generateOrderNumber();
    }

    // Create the order
    const created = await tx.orders.create({
      data: {
        order_number: orderNumber,
        user_id: userId,
        status: "pending_payment",
        currency: "IDR",
        subtotal_amount: subtotalAmount,
        discount_amount: discountAmount,
        shipping_amount: shippingAmount,
        total_amount: totalAmount,
        shipping_address_snapshot: shipping_address,
        shipping_courier: shipping_courier ?? null,
        shipping_service: shipping_service ?? null,
        // Create all line items in the same statement
        order_items: {
          create: lineItems.map((li) => ({
            product_id: li.product_id,
            variant_id: li.variant_id,
            product_name_snapshot: li.product_name_snapshot,
            variant_snapshot: li.variant_snapshot,
            unit_price: li.unit_price,
            quantity: li.quantity,
            line_total: li.line_total,
          })),
        },
        // Attach voucher record if applicable
        ...(voucherRecord
          ? {
              order_vouchers: {
                create: {
                  voucher_id: voucherRecord.id,
                  code_snapshot: voucherRecord.code,
                  discount_amount: discountAmount,
                },
              },
            }
          : {}),
      },
      select: {
        id: true,
        order_number: true,
        status: true,
        currency: true,
        subtotal_amount: true,
        discount_amount: true,
        shipping_amount: true,
        total_amount: true,
        created_at: true,
        order_items: {
          select: {
            id: true,
            product_id: true,
            variant_id: true,
            product_name_snapshot: true,
            variant_snapshot: true,
            unit_price: true,
            quantity: true,
            line_total: true,
          },
        },
      },
    });

    // Reserve stock for each variant
    for (const item of deduplicatedItems) {
      await tx.inventory.update({
        where: { variant_id: item.variant_id },
        data: { stock_reserved: { increment: item.quantity } },
      });
    }

    return created;
  });

  // ── 8. Return 201 with order summary ─────────────────────────────────────
  return apiSuccess(
    {
      id: order.id,
      order_number: order.order_number,
      status: order.status,
      currency: order.currency,
      subtotal_amount: order.subtotal_amount,
      discount_amount: order.discount_amount,
      shipping_amount: order.shipping_amount,
      total_amount: order.total_amount,
      items: order.order_items,
      created_at: order.created_at,
    },
    201
  );
}

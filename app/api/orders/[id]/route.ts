import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiSuccess, apiError } from "@/lib/auth/response";
import { requireAuth } from "@/lib/auth/guard";

// ── GET /api/orders/:id ────────────────────────────────────────────────────
// Auth required (owner or admin/super_admin).
//
// Error precedence (per Requirement 2.5):
//   1. 401 — missing/invalid/expired JWT
//   2. 400 — invalid UUID format for :id
//   3. 404 — order not found
//   4. 403 — requester is not owner and not admin

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // ── 1. Auth ──────────────────────────────────────────────────────────────
  const guard = requireAuth(request);
  if (!guard.ok) return guard.error;

  const { payload } = guard;

  // ── 2. Await params and validate UUID format ──────────────────────────────
  // Next.js 15: params is a Promise — must be awaited before destructuring.
  const { id } = await params;

  const uuidResult = z.uuid().safeParse(id);
  if (!uuidResult.success) {
    return apiError("Invalid order ID format.", 400);
  }

  // ── 3. Fetch order with nested items and voucher ──────────────────────────
  const order = await prisma.orders.findUnique({
    where: { id },
    select: {
      id: true,
      order_number: true,
      status: true,
      currency: true,
      subtotal_amount: true,
      discount_amount: true,
      shipping_amount: true,
      total_amount: true,
      shipping_address_snapshot: true,
      shipping_courier: true,
      shipping_service: true,
      tracking_number: true,
      paid_at: true,
      created_at: true,
      updated_at: true,
      user_id: true,
      order_items: {
        select: {
          id: true,
          product_id: true,
          product_name_snapshot: true,
          variant_snapshot: true,
          quantity: true,
          unit_price: true,
          line_total: true,
        },
      },
      order_vouchers: {
        select: {
          code_snapshot: true,
          discount_amount: true,
        },
      },
    },
  });

  // ── 4. 404 if not found ───────────────────────────────────────────────────
  if (!order) {
    return apiError("Order not found.", 404);
  }

  // ── 5. Ownership / admin check ────────────────────────────────────────────
  const isOwner = payload.sub === order.user_id;
  const isAdmin = payload.role === "admin" || payload.role === "super_admin";

  if (!isOwner && !isAdmin) {
    return apiError("Forbidden.", 403);
  }

  // ── 6. Build response — map line_total → total_price, voucher or null ─────
  const { user_id: _userId, order_vouchers, order_items, ...orderFields } = order;

  return apiSuccess({
    ...orderFields,
    items: order_items.map((item) => ({
      id: item.id,
      product_id: item.product_id,
      product_name_snapshot: item.product_name_snapshot,
      variant_snapshot: item.variant_snapshot,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: item.line_total, // line_total → total_price per spec
    })),
    voucher: order_vouchers
      ? {
          code_snapshot: order_vouchers.code_snapshot,
          discount_amount: order_vouchers.discount_amount,
        }
      : null,
  });
}

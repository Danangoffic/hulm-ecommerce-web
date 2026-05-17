import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSuccess, apiError } from "@/lib/auth/response";
import { requireAuth } from "@/lib/auth/guard";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/orders/helpers";

// ── GET /api/orders/user/:userId ───────────────────────────────────────────
// Auth required. Requester must be the owner or have admin/super_admin role.
//
// Query parameters:
//   page     – positive integer, default 1
//   pageSize – positive integer, default 10, max 100
//   status   – optional, must be one of ORDER_STATUSES values
//
// Response:
//   200 { success: true, data: { orders: [...], total, page, pageSize } }
//   Each order: { id, order_number, status, currency, total_amount,
//                 created_at, updated_at, item_count }

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  // ── 1. Auth ──────────────────────────────────────────────────────────────
  const guard = requireAuth(request);
  if (!guard.ok) return guard.error;

  const { payload } = guard;

  // ── 2. Resolve & validate userId path param ──────────────────────────────
  const { userId } = await params;

  if (!UUID_REGEX.test(userId)) {
    return apiError("Invalid user ID format.", 400);
  }

  // ── 3. Ownership / admin check ───────────────────────────────────────────
  const isAdmin =
    payload.role === "admin" || payload.role === "super_admin";

  if (payload.sub !== userId && !isAdmin) {
    return apiError("Forbidden.", 403);
  }

  // ── 4. Parse & validate pagination params ────────────────────────────────
  const searchParams = request.nextUrl.searchParams;

  const pageRaw = searchParams.get("page");
  const pageSizeRaw = searchParams.get("pageSize");

  const page = pageRaw == null ? 1 : Number(pageRaw);
  const pageSize = pageSizeRaw == null ? 10 : Number(pageSizeRaw);

  const isPositiveInteger = (n: number) =>
    Number.isInteger(n) && n >= 1;

  const pageValid = isPositiveInteger(page);
  const pageSizeValid = isPositiveInteger(pageSize) && pageSize <= 100;

  if (!pageValid || !pageSizeValid) {
    return apiError("Invalid pagination parameters.", 400);
  }

  // ── 5. Parse & validate status filter ────────────────────────────────────
  const statusRaw = searchParams.get("status");
  let statusFilter: OrderStatus | undefined;

  if (statusRaw !== null) {
    if (!(ORDER_STATUSES as readonly string[]).includes(statusRaw)) {
      return apiError("Invalid status filter.", 400);
    }
    statusFilter = statusRaw as OrderStatus;
  }

  // ── 6. Build shared where clause ─────────────────────────────────────────
  const where = {
    user_id: userId,
    ...(statusFilter ? { status: statusFilter } : {}),
  };

  // ── 7. Query DB ───────────────────────────────────────────────────────────
  const [orders, total] = await Promise.all([
    prisma.orders.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        order_number: true,
        status: true,
        currency: true,
        total_amount: true,
        created_at: true,
        updated_at: true,
        _count: {
          select: { order_items: true },
        },
      },
    }),
    prisma.orders.count({ where }),
  ]);

  // ── 8. Shape response ─────────────────────────────────────────────────────
  const shaped = orders.map((order) => ({
    id: order.id,
    order_number: order.order_number,
    status: order.status,
    currency: order.currency,
    total_amount: order.total_amount,
    created_at: order.created_at,
    updated_at: order.updated_at,
    item_count: order._count.order_items,
  }));

  return apiSuccess({ orders: shaped, total, page, pageSize });
}

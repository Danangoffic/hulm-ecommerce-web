import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mock prisma ────────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    products: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    order_items: {
      groupBy: vi.fn(),
    },
  },
}));

import { GET } from "@/app/api/products/route";
import { prisma } from "@/lib/prisma";

const mock = prisma as {
  products: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
  order_items: { groupBy: ReturnType<typeof vi.fn> };
};

// ── Fixtures ───────────────────────────────────────────────────────────────

const makeProduct = (overrides: Record<string, unknown> = {}) => ({
  id: "550e8400-e29b-41d4-a716-446655440001",
  name: "Jaket Parka",
  slug: "jaket-parka",
  description: "Jaket parka premium",
  base_price: "350000",
  status: "published",
  is_active: true,
  category_id: "550e8400-e29b-41d4-a716-446655440010",
  created_at: new Date("2026-01-01"),
  updated_at: new Date("2026-01-01"),
  categories: { id: "550e8400-e29b-41d4-a716-446655440010", name: "Jaket", slug: "jaket" },
  product_images: [{ id: "img-1", image_url: "https://example.com/img.jpg", alt_text: null, sort_order: 0 }],
  product_variants: [
    { id: "var-1", color: "coklat", size: "M", price: null },
    { id: "var-2", color: "olive", size: "XL", price: "380000" },
  ],
  _count: { reviews: 5, order_items: 20 },
  ...overrides,
});

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL("http://localhost/api/products");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.products.findMany.mockResolvedValue([makeProduct()]);
  mock.products.count.mockResolvedValue(1);
});

// ── GET /api/products ──────────────────────────────────────────────────────

describe("GET /api/products", () => {

  // ── Response shape ─────────────────────────────────────────────────────

  it("200 — returns success with data and pagination", async () => {
    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.data)).toBe(true);
    expect(body.data.pagination).toMatchObject({
      page: 1,
      limit: 20,
      total: 1,
      pages: 1,
    });
  });

  it("200 — each item has expected fields", async () => {
    const res = await GET(makeRequest());
    const body = await res.json();
    const item = body.data.data[0];

    expect(item).toHaveProperty("id");
    expect(item).toHaveProperty("name");
    expect(item).toHaveProperty("slug");
    expect(item).toHaveProperty("base_price");
    expect(item).toHaveProperty("cover_image");
    expect(item).toHaveProperty("colors");
    expect(item).toHaveProperty("sizes");
    expect(item).toHaveProperty("review_count");
    expect(item).toHaveProperty("order_count");
  });

  it("200 — colors and sizes are derived from variants", async () => {
    const res = await GET(makeRequest());
    const body = await res.json();
    const item = body.data.data[0];

    expect(item.colors).toEqual(expect.arrayContaining(["coklat", "olive"]));
    expect(item.sizes).toEqual(expect.arrayContaining(["M", "XL"]));
  });

  it("200 — filters object is included in response", async () => {
    const res = await GET(makeRequest({ q: "jaket", sort: "newest" }));
    const body = await res.json();

    expect(body.data.filters).toMatchObject({ q: "jaket", sort: "newest" });
  });

  it("200 — empty list when no products found", async () => {
    mock.products.findMany.mockResolvedValue([]);
    mock.products.count.mockResolvedValue(0);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.data).toHaveLength(0);
    expect(body.data.pagination.total).toBe(0);
  });

  // ── Search ─────────────────────────────────────────────────────────────

  it("passes name contains filter when ?q is set", async () => {
    await GET(makeRequest({ q: "jaket" }));

    const whereArg = mock.products.findMany.mock.calls[0][0].where;
    expect(whereArg.name).toMatchObject({ contains: "jaket", mode: "insensitive" });
  });

  it("no name filter when ?q is empty", async () => {
    await GET(makeRequest({ q: "" }));

    const whereArg = mock.products.findMany.mock.calls[0][0].where;
    expect(whereArg.name).toBeUndefined();
  });

  // ── Category filter ────────────────────────────────────────────────────

  it("passes category_id filter when set", async () => {
    const catId = "550e8400-e29b-41d4-a716-446655440010";
    await GET(makeRequest({ category_id: catId }));

    const whereArg = mock.products.findMany.mock.calls[0][0].where;
    expect(whereArg.category_id).toBe(catId);
  });

  it("no category_id filter when not set", async () => {
    await GET(makeRequest());

    const whereArg = mock.products.findMany.mock.calls[0][0].where;
    expect(whereArg.category_id).toBeUndefined();
  });

  // ── Price filter ───────────────────────────────────────────────────────

  it("passes min_price filter", async () => {
    await GET(makeRequest({ min_price: "100000" }));

    const whereArg = mock.products.findMany.mock.calls[0][0].where;
    expect(whereArg.base_price?.gte).toBe(100000);
  });

  it("passes max_price filter", async () => {
    await GET(makeRequest({ max_price: "500000" }));

    const whereArg = mock.products.findMany.mock.calls[0][0].where;
    expect(whereArg.base_price?.lte).toBe(500000);
  });

  it("passes both min and max price filters", async () => {
    await GET(makeRequest({ min_price: "100000", max_price: "500000" }));

    const whereArg = mock.products.findMany.mock.calls[0][0].where;
    expect(whereArg.base_price).toMatchObject({ gte: 100000, lte: 500000 });
  });

  it("no price filter when not set", async () => {
    await GET(makeRequest());

    const whereArg = mock.products.findMany.mock.calls[0][0].where;
    expect(whereArg.base_price).toBeUndefined();
  });

  // ── Sorting ────────────────────────────────────────────────────────────

  it("sort=newest orders by created_at desc (default)", async () => {
    await GET(makeRequest({ sort: "newest" }));

    const orderByArg = mock.products.findMany.mock.calls[0][0].orderBy;
    expect(orderByArg).toMatchObject({ created_at: "desc" });
  });

  it("sort=oldest orders by created_at asc", async () => {
    await GET(makeRequest({ sort: "oldest" }));

    const orderByArg = mock.products.findMany.mock.calls[0][0].orderBy;
    expect(orderByArg).toMatchObject({ created_at: "asc" });
  });

  it("sort=price_asc orders by base_price asc", async () => {
    await GET(makeRequest({ sort: "price_asc" }));

    const orderByArg = mock.products.findMany.mock.calls[0][0].orderBy;
    expect(orderByArg).toMatchObject({ base_price: "asc" });
  });

  it("sort=price_desc orders by base_price desc", async () => {
    await GET(makeRequest({ sort: "price_desc" }));

    const orderByArg = mock.products.findMany.mock.calls[0][0].orderBy;
    expect(orderByArg).toMatchObject({ base_price: "desc" });
  });

  it("400 — invalid sort value", async () => {
    const res = await GET(makeRequest({ sort: "random" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  // ── Trending sort ──────────────────────────────────────────────────────

  it("sort=trending queries order_items groupBy", async () => {
    mock.order_items.groupBy.mockResolvedValue([
      { product_id: "550e8400-e29b-41d4-a716-446655440001", _count: { product_id: 10 } },
    ]);

    await GET(makeRequest({ sort: "trending" }));

    expect(mock.order_items.groupBy).toHaveBeenCalledOnce();
    const groupByArg = mock.order_items.groupBy.mock.calls[0][0];
    expect(groupByArg.by).toContain("product_id");
    expect(groupByArg.orderBy).toMatchObject({ _count: { product_id: "desc" } });
  });

  it("sort=trending returns empty list when no orders in last 30 days", async () => {
    mock.order_items.groupBy.mockResolvedValue([]);
    mock.products.findMany.mockResolvedValue([]);
    mock.products.count.mockResolvedValue(0);

    const res = await GET(makeRequest({ sort: "trending" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.data).toHaveLength(0);
  });

  // ── Pagination ─────────────────────────────────────────────────────────

  it("default page=1 limit=20", async () => {
    await GET(makeRequest());

    const call = mock.products.findMany.mock.calls[0][0];
    expect(call.skip).toBe(0);
    expect(call.take).toBe(20);
  });

  it("page=2 limit=10 skips 10 records", async () => {
    await GET(makeRequest({ page: "2", limit: "10" }));

    const call = mock.products.findMany.mock.calls[0][0];
    expect(call.skip).toBe(10);
    expect(call.take).toBe(10);
  });

  it("clamps limit to max 100", async () => {
    await GET(makeRequest({ limit: "999" }));

    const call = mock.products.findMany.mock.calls[0][0];
    expect(call.take).toBe(100);
  });

  it("clamps page to min 1 for invalid values", async () => {
    await GET(makeRequest({ page: "-5" }));

    const call = mock.products.findMany.mock.calls[0][0];
    expect(call.skip).toBe(0);
  });

  it("pagination.pages is calculated correctly", async () => {
    mock.products.count.mockResolvedValue(45);

    const res = await GET(makeRequest({ limit: "10" }));
    const body = await res.json();

    expect(body.data.pagination.pages).toBe(5);
  });

  // ── Always filters published + active + non-deleted ────────────────────

  it("always filters status=published, is_active=true, deleted_at=null", async () => {
    await GET(makeRequest());

    const whereArg = mock.products.findMany.mock.calls[0][0].where;
    expect(whereArg.status).toBe("published");
    expect(whereArg.is_active).toBe(true);
    expect(whereArg.deleted_at).toBeNull();
  });
});

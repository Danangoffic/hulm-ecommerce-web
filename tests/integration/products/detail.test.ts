import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mock prisma ────────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    products: {
      findFirst: vi.fn(),
    },
    reviews: {
      aggregate: vi.fn(),
    },
  },
}));

import { GET } from "@/app/api/products/[id]/route";
import { prisma } from "@/lib/prisma";

const mock = prisma as {
  products: { findFirst: ReturnType<typeof vi.fn> };
  reviews: { aggregate: ReturnType<typeof vi.fn> };
};

// ── Fixtures ───────────────────────────────────────────────────────────────

const PRODUCT_ID = "550e8400-e29b-41d4-a716-446655440001";
const PRODUCT_SLUG = "jaket-parka";

const makeProduct = (overrides: Record<string, unknown> = {}) => ({
  id: PRODUCT_ID,
  name: "Jaket Parka",
  slug: PRODUCT_SLUG,
  description: "Jaket parka premium",
  base_price: "350000",
  status: "published",
  is_active: true,
  category_id: "550e8400-e29b-41d4-a716-446655440010",
  created_at: new Date("2026-01-01"),
  updated_at: new Date("2026-01-01"),
  categories: {
    id: "550e8400-e29b-41d4-a716-446655440010",
    name: "Jaket",
    slug: "jaket",
    image_url: null,
  },
  product_images: [
    { id: "img-1", image_url: "https://example.com/img1.jpg", alt_text: null, sort_order: 0 },
    { id: "img-2", image_url: "https://example.com/img2.jpg", alt_text: "Side view", sort_order: 1 },
  ],
  product_variants: [
    {
      id: "var-1", sku: "JKT-COKLAT-M", color: "coklat", size: "M",
      price: null, is_active: true,
      inventory: { stock_on_hand: 10, stock_reserved: 2 },
    },
    {
      id: "var-2", sku: "JKT-OLIVE-XL", color: "olive", size: "XL",
      price: "380000", is_active: true,
      inventory: { stock_on_hand: 5, stock_reserved: 5 },
    },
    {
      id: "var-3", sku: "JKT-PUTIH-S", color: "putih", size: "S",
      price: null, is_active: true,
      inventory: null, // no inventory record yet
    },
  ],
  reviews: [
    {
      id: "rev-1", rating: 5, comment: "Bagus banget",
      created_at: new Date("2026-02-01"),
      users: { id: "user-1", name: "Budi" },
    },
    {
      id: "rev-2", rating: 4, comment: "Oke",
      created_at: new Date("2026-01-15"),
      users: { id: "user-2", name: "Sari" },
    },
  ],
  _count: { reviews: 2, order_items: 15 },
  ...overrides,
});

const makeRatingAggregate = (avg: number | null = 4.5, count = 2) => ({
  _avg: { rating: avg },
  _count: { rating: count },
});

function makeRequest(id: string, params: Record<string, string> = {}, role?: string): NextRequest {
  const url = new URL(`http://localhost/api/products/${id}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers: Record<string, string> = {};
  if (role) headers["x-user-role"] = role;
  return new NextRequest(url, { headers });
}

function makeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.products.findFirst.mockResolvedValue(makeProduct());
  mock.reviews.aggregate.mockResolvedValue(makeRatingAggregate());
});

// ── GET /api/products/[id] ─────────────────────────────────────────────────

describe("GET /api/products/[id]", () => {

  // ── Response shape ─────────────────────────────────────────────────────

  it("200 — returns product by UUID", async () => {
    const res = await GET(makeRequest(PRODUCT_ID), makeCtx(PRODUCT_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(PRODUCT_ID);
  });

  it("200 — returns product by slug", async () => {
    const res = await GET(makeRequest(PRODUCT_SLUG), makeCtx(PRODUCT_SLUG));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.slug).toBe(PRODUCT_SLUG);
  });

  it("200 — response has all required fields", async () => {
    const res = await GET(makeRequest(PRODUCT_ID), makeCtx(PRODUCT_ID));
    const body = await res.json();
    const d = body.data;

    expect(d).toHaveProperty("id");
    expect(d).toHaveProperty("name");
    expect(d).toHaveProperty("slug");
    expect(d).toHaveProperty("description");
    expect(d).toHaveProperty("base_price");
    expect(d).toHaveProperty("category");
    expect(d).toHaveProperty("images");
    expect(d).toHaveProperty("colors");
    expect(d).toHaveProperty("sizes");
    expect(d).toHaveProperty("variants");
    expect(d).toHaveProperty("rating");
    expect(d).toHaveProperty("reviews");
    expect(d).toHaveProperty("order_count");
  });

  it("200 — images array contains all product images", async () => {
    const res = await GET(makeRequest(PRODUCT_ID), makeCtx(PRODUCT_ID));
    const body = await res.json();
    expect(body.data.images).toHaveLength(2);
  });

  it("200 — colors and sizes are unique and derived from variants", async () => {
    const res = await GET(makeRequest(PRODUCT_ID), makeCtx(PRODUCT_ID));
    const body = await res.json();

    expect(body.data.colors).toEqual(expect.arrayContaining(["coklat", "olive", "putih"]));
    expect(body.data.sizes).toEqual(expect.arrayContaining(["M", "XL", "S"]));
    // No duplicates
    expect(body.data.colors.length).toBe(new Set(body.data.colors).size);
    expect(body.data.sizes.length).toBe(new Set(body.data.sizes).size);
  });

  // ── Variants with stock ────────────────────────────────────────────────

  it("200 — variants include available_stock", async () => {
    const res = await GET(makeRequest(PRODUCT_ID), makeCtx(PRODUCT_ID));
    const body = await res.json();
    const variant = body.data.variants.find((v: { id: string }) => v.id === "var-1");

    expect(variant.stock_on_hand).toBe(10);
    expect(variant.stock_reserved).toBe(2);
    expect(variant.available_stock).toBe(8); // 10 - 2
  });

  it("200 — available_stock is 0 when fully reserved", async () => {
    const res = await GET(makeRequest(PRODUCT_ID), makeCtx(PRODUCT_ID));
    const body = await res.json();
    const variant = body.data.variants.find((v: { id: string }) => v.id === "var-2");

    expect(variant.available_stock).toBe(0); // 5 - 5
  });

  it("200 — available_stock is 0 when no inventory record", async () => {
    const res = await GET(makeRequest(PRODUCT_ID), makeCtx(PRODUCT_ID));
    const body = await res.json();
    const variant = body.data.variants.find((v: { id: string }) => v.id === "var-3");

    expect(variant.stock_on_hand).toBe(0);
    expect(variant.available_stock).toBe(0);
  });

  it("200 — variant price falls back to base_price when null", async () => {
    const res = await GET(makeRequest(PRODUCT_ID), makeCtx(PRODUCT_ID));
    const body = await res.json();
    const variant = body.data.variants.find((v: { id: string }) => v.id === "var-1");

    // price is null → should equal base_price
    expect(variant.price).toBe("350000");
  });

  // ── Rating ─────────────────────────────────────────────────────────────

  it("200 — rating uses aggregate (not just fetched reviews)", async () => {
    mock.reviews.aggregate.mockResolvedValue(makeRatingAggregate(4.7, 100));

    const res = await GET(makeRequest(PRODUCT_ID), makeCtx(PRODUCT_ID));
    const body = await res.json();

    expect(body.data.rating.average).toBe(4.7);
    expect(body.data.rating.count).toBe(100);
  });

  it("200 — rating.average is null when no reviews", async () => {
    mock.reviews.aggregate.mockResolvedValue(makeRatingAggregate(null, 0));

    const res = await GET(makeRequest(PRODUCT_ID), makeCtx(PRODUCT_ID));
    const body = await res.json();

    expect(body.data.rating.average).toBeNull();
    expect(body.data.rating.count).toBe(0);
  });

  it("200 — rating.average is rounded to 1 decimal", async () => {
    mock.reviews.aggregate.mockResolvedValue(makeRatingAggregate(4.666, 3));

    const res = await GET(makeRequest(PRODUCT_ID), makeCtx(PRODUCT_ID));
    const body = await res.json();

    expect(body.data.rating.average).toBe(4.7);
  });

  // ── Reviews ────────────────────────────────────────────────────────────

  it("200 — reviews include user name", async () => {
    const res = await GET(makeRequest(PRODUCT_ID), makeCtx(PRODUCT_ID));
    const body = await res.json();

    expect(body.data.reviews[0].user.name).toBe("Budi");
  });

  it("200 — reviews do not expose user password_hash", async () => {
    const res = await GET(makeRequest(PRODUCT_ID), makeCtx(PRODUCT_ID));
    const body = await res.json();

    for (const review of body.data.reviews) {
      expect(review.user).not.toHaveProperty("password_hash");
    }
  });

  // ── UUID vs slug lookup ────────────────────────────────────────────────

  it("queries by id when param is a UUID", async () => {
    await GET(makeRequest(PRODUCT_ID), makeCtx(PRODUCT_ID));

    const whereArg = mock.products.findFirst.mock.calls[0][0].where;
    expect(whereArg.id).toBe(PRODUCT_ID);
    expect(whereArg.slug).toBeUndefined();
  });

  it("queries by slug when param is not a UUID", async () => {
    await GET(makeRequest(PRODUCT_SLUG), makeCtx(PRODUCT_SLUG));

    const whereArg = mock.products.findFirst.mock.calls[0][0].where;
    expect(whereArg.slug).toBe(PRODUCT_SLUG);
    expect(whereArg.id).toBeUndefined();
  });

  // ── Admin preview ──────────────────────────────────────────────────────

  it("public request filters status=published and is_active=true", async () => {
    await GET(makeRequest(PRODUCT_ID), makeCtx(PRODUCT_ID));

    const whereArg = mock.products.findFirst.mock.calls[0][0].where;
    expect(whereArg.status).toBe("published");
    expect(whereArg.is_active).toBe(true);
  });

  it("admin with ?preview=1 does not filter by status or is_active", async () => {
    await GET(makeRequest(PRODUCT_ID, { preview: "1" }, "admin"), makeCtx(PRODUCT_ID));

    const whereArg = mock.products.findFirst.mock.calls[0][0].where;
    expect(whereArg.status).toBeUndefined();
    expect(whereArg.is_active).toBeUndefined();
  });

  it("non-admin with ?preview=1 still filters by status", async () => {
    await GET(makeRequest(PRODUCT_ID, { preview: "1" }), makeCtx(PRODUCT_ID));

    const whereArg = mock.products.findFirst.mock.calls[0][0].where;
    expect(whereArg.status).toBe("published");
  });

  // ── Not found ──────────────────────────────────────────────────────────

  it("404 — product not found by UUID", async () => {
    mock.products.findFirst.mockResolvedValue(null);

    const res = await GET(makeRequest(PRODUCT_ID), makeCtx(PRODUCT_ID));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("Product not found.");
  });

  it("404 — product not found by slug", async () => {
    mock.products.findFirst.mockResolvedValue(null);

    const res = await GET(makeRequest("non-existent-slug"), makeCtx("non-existent-slug"));
    expect(res.status).toBe(404);
  });

  // ── Always filters deleted_at=null ─────────────────────────────────────

  it("always filters deleted_at=null", async () => {
    await GET(makeRequest(PRODUCT_ID), makeCtx(PRODUCT_ID));

    const whereArg = mock.products.findFirst.mock.calls[0][0].where;
    expect(whereArg.deleted_at).toBeNull();
  });
});

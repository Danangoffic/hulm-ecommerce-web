import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSuccess, apiError } from "@/lib/auth/response";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// ── GET /api/public/categories/[slug] ──────────────────────────────────────
// Public — detail kategori beserta list produk aktif yang dipublish.
//
// Query params:
//   page      — nomor halaman, default 1
//   page_size — jumlah produk per halaman, default 20, max 100
//   sort      — "newest" | "price_asc" | "price_desc" | "name", default "newest"

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/public/categories/[slug]">
) {
  const { slug } = await ctx.params;
  const { searchParams } = request.nextUrl;

  // ── Pagination ─────────────────────────────────────────────────────────
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number.parseInt(searchParams.get("page_size") ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE)
  );
  const skip = (page - 1) * pageSize;

  // ── Sorting ────────────────────────────────────────────────────────────
  type SortOption = "newest" | "price_asc" | "price_desc" | "name";
  const sortParam = (searchParams.get("sort") ?? "newest") as SortOption;
  const orderBy: Record<SortOption, object> = {
    newest:     { created_at: "desc" },
    price_asc:  { base_price: "asc" },
    price_desc: { base_price: "desc" },
    name:       { name: "asc" },
  };
  const productOrder = orderBy[sortParam] ?? orderBy.newest;

  // ── Base filter — only active, published, non-deleted products ─────────
  const productWhere = {
    is_active: true,
    status: "published",
    deleted_at: null,
  } as const;

  // ── Fetch category + products in parallel ──────────────────────────────
  const [category, products, totalProducts] = await Promise.all([
    prisma.categories.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        image_url: true,
      },
    }),

    prisma.products.findMany({
      where: { categories: { slug }, ...productWhere },
      orderBy: productOrder,
      skip,
      take: pageSize,
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        base_price: true,
        // Gambar pertama (sort_order terendah, belum dihapus)
        product_images: {
          where: { deleted_at: null },
          orderBy: { sort_order: "asc" },
          take: 1,
          select: { image_url: true, alt_text: true },
        },
        // Rata-rata rating dari reviews
        reviews: {
          select: { rating: true },
        },
        // Jumlah varian aktif (indikasi ketersediaan stok)
        _count: {
          select: {
            product_variants: { where: { is_active: true } },
          },
        },
      },
    }),

    prisma.products.count({
      where: { categories: { slug }, ...productWhere },
    }),
  ]);

  if (!category) {
    return apiError("Category not found.", 404);
  }

  // ── Shape product response ─────────────────────────────────────────────
  const shapedProducts = products.map((p) => {
    const ratings = p.reviews.map((r) => r.rating);
    const avg_rating =
      ratings.length > 0
        ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
        : null;

    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      base_price: p.base_price,
      thumbnail: p.product_images[0] ?? null,
      avg_rating,
      review_count: ratings.length,
      variant_count: p._count.product_variants,
    };
  });

  const totalPages = Math.ceil(totalProducts / pageSize);

  return apiSuccess({
    category,
    products: shapedProducts,
    pagination: {
      page,
      page_size: pageSize,
      total: totalProducts,
      total_pages: totalPages,
      has_next: page < totalPages,
      has_prev: page > 1,
    },
  });
}

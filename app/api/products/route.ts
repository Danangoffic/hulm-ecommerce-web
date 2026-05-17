import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSuccess, apiError } from "@/lib/auth/response";
import { createProductSchema, toSlug } from "@/lib/products/validation";
import { uploadProductImages } from "@/lib/supabase/storage";

// ── Shared select shape for list ───────────────────────────────────────────

const PRODUCT_LIST_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  base_price: true,
  status: true,
  is_active: true,
  category_id: true,
  created_at: true,
  updated_at: true,
  categories: { select: { id: true, name: true, slug: true } },
  // Only the first image (cover) for list view
  product_images: {
    where: { deleted_at: null },
    select: { id: true, image_url: true, alt_text: true, sort_order: true },
    orderBy: { sort_order: "asc" as const },
    take: 1,
  },
  // Active variants — expose available colors & sizes
  product_variants: {
    where: { is_active: true },
    select: { id: true, color: true, size: true, price: true },
  },
  // Aggregate review rating
  _count: { select: { reviews: true, order_items: true } },
} as const;

// Valid sort options
type SortOption = "newest" | "oldest" | "price_asc" | "price_desc" | "trending";

function buildOrderBy(sort: SortOption) {
  switch (sort) {
    case "oldest":      return { created_at: "asc" as const };
    case "price_asc":   return { base_price: "asc" as const };
    case "price_desc":  return { base_price: "desc" as const };
    // trending & newest both default to created_at desc here;
    // trending is handled separately via order_items count subquery
    default:            return { created_at: "desc" as const };
  }
}

// ── GET /api/products ──────────────────────────────────────────────────────
// Public — list published, active, non-deleted products.
//
// Query params:
//   ?q=<string>           search by product name (case-insensitive, partial)
//   ?category_id=<uuid>   filter by category
//   ?min_price=<number>   filter base_price >= value
//   ?max_price=<number>   filter base_price <= value
//   ?sort=newest          sort: newest | oldest | price_asc | price_desc | trending
//   ?page=1&limit=20      pagination (max limit 100)

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // ── Parse query params ───────────────────────────────────────────────────
  const q          = searchParams.get("q")?.trim() ?? "";
  const categoryId = searchParams.get("category_id")?.trim() ?? "";
  const minPrice   = Number.parseFloat(searchParams.get("min_price") ?? "");
  const maxPrice   = Number.parseFloat(searchParams.get("max_price") ?? "");
  const sort       = (searchParams.get("sort") ?? "newest") as SortOption;
  const page       = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10));
  const limit      = Math.min(100, Math.max(1, Number.parseInt(searchParams.get("limit") ?? "20", 10)));
  const skip       = (page - 1) * limit;

  // Validate sort value
  const validSorts: SortOption[] = ["newest", "oldest", "price_asc", "price_desc", "trending"];
  if (!validSorts.includes(sort)) {
    return apiError(
      `Invalid sort value. Allowed: ${validSorts.join(", ")}.`,
      400
    );
  }

  // ── Build where clause ───────────────────────────────────────────────────
  const hasMinPrice = !Number.isNaN(minPrice);
  const hasMaxPrice = !Number.isNaN(maxPrice);

  const where: Parameters<typeof prisma.products.findMany>[0]["where"] = {
    deleted_at: null,
    status: "published",
    is_active: true,
    ...(q && { name: { contains: q, mode: "insensitive" } }),
    ...(categoryId && { category_id: categoryId }),
    ...(hasMinPrice || hasMaxPrice
      ? {
          base_price: {
            ...(hasMinPrice && { gte: minPrice }),
            ...(hasMaxPrice && { lte: maxPrice }),
          },
        }
      : {}),
  };

  // ── Trending: sort by order_items count in last 30 days ──────────────────
  if (sort === "trending") {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Get product IDs ordered by recent order count
    const trendingRaw = await prisma.order_items.groupBy({
      by: ["product_id"],
      where: { created_at: { gte: thirtyDaysAgo } },
      _count: { product_id: true },
      orderBy: { _count: { product_id: "desc" } },
    });

    const trendingIds = trendingRaw.map((r) => r.product_id);

    // Fetch matching products that pass the where filters
    const [products, total] = await Promise.all([
      prisma.products.findMany({
        where: { ...where, id: { in: trendingIds.length > 0 ? trendingIds : ["__none__"] } },
        select: PRODUCT_LIST_SELECT,
        skip,
        take: limit,
      }),
      prisma.products.count({
        where: { ...where, id: { in: trendingIds.length > 0 ? trendingIds : ["__none__"] } },
      }),
    ]);

    // Re-sort by trending rank (Prisma doesn't preserve IN order)
    const rankMap = new Map(trendingIds.map((id, i) => [id, i]));
    const sorted = [...products].sort(
      (a, b) => (rankMap.get(a.id) ?? 999) - (rankMap.get(b.id) ?? 999)
    );

    return apiSuccess({
      data: sorted.map(formatProduct),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      filters: { q: q || null, category_id: categoryId || null, min_price: minPrice || null, max_price: maxPrice || null, sort },
    });
  }

  // ── Standard sort ────────────────────────────────────────────────────────
  const [products, total] = await Promise.all([
    prisma.products.findMany({
      where,
      select: PRODUCT_LIST_SELECT,
      orderBy: buildOrderBy(sort),
      skip,
      take: limit,
    }),
    prisma.products.count({ where }),
  ]);

  return apiSuccess({
    data: products.map(formatProduct),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    filters: { q: q || null, category_id: categoryId || null, min_price: minPrice || null, max_price: maxPrice || null, sort },
  });
}

// ── Format helper — shapes the list item response ─────────────────────────

function formatProduct(p: {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  base_price: unknown;
  status: string;
  is_active: boolean;
  category_id: string | null;
  created_at: Date;
  updated_at: Date;
  categories: { id: string; name: string; slug: string } | null;
  product_images: { id: string; image_url: string; alt_text: string | null; sort_order: number }[];
  product_variants: { id: string; color: string; size: string; price: unknown }[];
  _count: { reviews: number; order_items: number };
}) {
  // Derive unique colors and sizes from active variants
  const colors = [...new Set(p.product_variants.map((v) => v.color))];
  const sizes  = [...new Set(p.product_variants.map((v) => v.size))];

  return {
    id:           p.id,
    name:         p.name,
    slug:         p.slug,
    description:  p.description,
    base_price:   p.base_price,
    status:       p.status,
    is_active:    p.is_active,
    category_id:  p.category_id,
    category:     p.categories,
    cover_image:  p.product_images[0] ?? null,
    colors,
    sizes,
    review_count: p._count.reviews,
    order_count:  p._count.order_items,
    created_at:   p.created_at,
    updated_at:   p.updated_at,
  };
}

// ── POST /api/products ─────────────────────────────────────────────────────
// Admin only — creates a new product with variants and optional images.
//
// Accepts multipart/form-data:
//   Fields (JSON-encoded string): name, slug?, description?, category_id?,
//                                  base_price, status?, is_active?, variants[]
//   Files: images[]  (multiple files, field name "images")
//
// OR application/json (no file upload):
//   Body: { name, slug?, description?, category_id?, base_price,
//           status?, is_active?, variants[] }

export async function POST(request: NextRequest) {
  const role = request.headers.get("x-user-role");
  if (role !== "admin" && role !== "super_admin") {
    return apiError("Forbidden.", 403);
  }

  const userId = request.headers.get("x-user-id");

  const contentType = request.headers.get("content-type") ?? "";

  let body: unknown;
  let imageFiles: File[] = [];

  // ── multipart/form-data ──────────────────────────────────────────────────
  if (contentType.includes("multipart/form-data")) {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return apiError("Failed to parse form data.", 400);
    }

    // The non-file fields are sent as a JSON string in the "data" field
    const dataField = formData.get("data");
    if (!dataField || typeof dataField !== "string") {
      return apiError(
        'multipart/form-data must include a "data" field with JSON-encoded product fields.',
        400
      );
    }

    try {
      body = JSON.parse(dataField);
    } catch {
      return apiError('The "data" field must be valid JSON.', 400);
    }

    // Collect all files from the "images" field (supports multiple)
    imageFiles = formData.getAll("images").filter(
      (f): f is File => f instanceof File && f.size > 0
    );

  // ── application/json ─────────────────────────────────────────────────────
  } else {
    try {
      body = await request.json();
    } catch {
      return apiError("Invalid JSON body.", 400);
    }
  }

  // ── Validate ─────────────────────────────────────────────────────────────
  const parsed = createProductSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Validation failed.", 422, parsed.error.flatten().fieldErrors);
  }

  const {
    name,
    slug: slugRaw,
    description,
    category_id,
    base_price,
    status,
    is_active,
    variants,
  } = parsed.data;

  const slug = slugRaw?.trim() || toSlug(name);

  // Unique slug check
  const existing = await prisma.products.findFirst({ where: { slug, deleted_at: null } });
  if (existing) {
    return apiError("A product with this slug already exists.", 409);
  }

  // ── Upload images ─────────────────────────────────────────────────────────
  let uploadedImages: { url: string; path: string }[] = [];
  if (imageFiles.length > 0) {
    try {
      uploadedImages = await uploadProductImages(imageFiles);
    } catch (err) {
      return apiError(
        err instanceof Error ? err.message : "Image upload failed.",
        422
      );
    }
  }

  // ── Create product + variants + images in a transaction ───────────────────
  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.products.create({
      data: {
        name: name.trim(),
        slug,
        description: description ?? null,
        category_id: category_id ?? null,
        base_price,
        status,
        is_active,
        created_by: userId ?? null,
        updated_by: userId ?? null,
        product_variants: {
          create: variants.map((v) => ({
            sku: v.sku ?? null,
            color: v.color,
            size: v.size,
            price: v.price ?? null,
            is_active: v.is_active,
          })),
        },
        product_images: {
          create: uploadedImages.map((img, idx) => ({
            image_url: img.url,
            sort_order: idx,
            created_by: userId ?? null,
            updated_by: userId ?? null,
          })),
        },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        base_price: true,
        status: true,
        is_active: true,
        category_id: true,
        created_at: true,
        updated_at: true,
        categories: { select: { id: true, name: true, slug: true } },
        product_images: {
          where: { deleted_at: null },
          select: { id: true, image_url: true, alt_text: true, sort_order: true },
          orderBy: { sort_order: "asc" },
        },
        product_variants: {
          select: { id: true, sku: true, color: true, size: true, price: true, is_active: true },
        },
      },
    });

    return created;
  });

  return apiSuccess(product, 201);
}

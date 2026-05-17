import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSuccess, apiError } from "@/lib/auth/response";
import { updateProductSchema, toSlug } from "@/lib/products/validation";
import { uploadProductImages, deleteProductImage } from "@/lib/supabase/storage";

// ── GET /api/products/[id] ─────────────────────────────────────────────────
// Public — returns full product detail by id or slug.
// Includes: all images, all active variants with stock, avg rating, reviews.
// Admin can also view draft/archived products by passing ?preview=1 with
// the x-user-role header set to admin/super_admin.

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/products/[id]">
) {
  const { id } = await ctx.params;
  const role = request.headers.get("x-user-role");
  const isAdmin = role === "admin" || role === "super_admin";
  const isPreview = request.nextUrl.searchParams.get("preview") === "1";

  // Support lookup by UUID or slug
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  // Admins with ?preview=1 can see any non-deleted product regardless of status
  const statusFilter = isAdmin && isPreview
    ? {}
    : { status: "published", is_active: true };

  const product = await prisma.products.findFirst({
    where: {
      deleted_at: null,
      ...statusFilter,
      ...(isUuid ? { id } : { slug: id }),
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
      // Category info
      categories: { select: { id: true, name: true, slug: true, image_url: true } },
      // All non-deleted images ordered by sort_order
      product_images: {
        where: { deleted_at: null },
        select: { id: true, image_url: true, alt_text: true, sort_order: true },
        orderBy: { sort_order: "asc" },
      },
      // Active variants with inventory stock
      product_variants: {
        where: { is_active: true },
        select: {
          id: true,
          sku: true,
          color: true,
          size: true,
          price: true,
          is_active: true,
          inventory: {
            select: { stock_on_hand: true, stock_reserved: true },
          },
        },
        orderBy: [{ color: "asc" }, { size: "asc" }],
      },
      // Recent reviews for display (latest 10)
      reviews: {
        select: {
          id: true,
          rating: true,
          comment: true,
          created_at: true,
          users: { select: { id: true, name: true } },
        },
        orderBy: { created_at: "desc" },
        take: 10,
      },
      // Accurate counts — reviews count used for avg rating calculation
      _count: { select: { reviews: true, order_items: true } },
    },
  });

  if (!product) {
    return apiError("Product not found.", 404);
  }

  // Compute accurate average rating across ALL reviews via aggregate
  const ratingAggregate = await prisma.reviews.aggregate({
    where: { product_id: product.id },
    _avg: { rating: true },
    _count: { rating: true },
  });

  const avgRating = ratingAggregate._avg.rating;

  // Derive unique colors and sizes
  const colors = [...new Set(product.product_variants.map((v) => v.color))];
  const sizes  = [...new Set(product.product_variants.map((v) => v.size))];

  // Shape variants: add available_stock = stock_on_hand - stock_reserved
  const variants = product.product_variants.map((v) => ({
    id:              v.id,
    sku:             v.sku,
    color:           v.color,
    size:            v.size,
    price:           v.price ?? product.base_price,
    is_active:       v.is_active,
    stock_on_hand:   v.inventory?.stock_on_hand ?? 0,
    stock_reserved:  v.inventory?.stock_reserved ?? 0,
    available_stock: Math.max(0, (v.inventory?.stock_on_hand ?? 0) - (v.inventory?.stock_reserved ?? 0)),
  }));

  return apiSuccess({
    id:           product.id,
    name:         product.name,
    slug:         product.slug,
    description:  product.description,
    base_price:   product.base_price,
    status:       product.status,
    is_active:    product.is_active,
    category_id:  product.category_id,
    category:     product.categories,
    images:       product.product_images,
    colors,
    sizes,
    variants,
    rating: {
      average:  avgRating === null ? null : Math.round(avgRating * 10) / 10,
      count:    ratingAggregate._count.rating,
    },
    reviews:      product.reviews.map((r) => ({
      id:         r.id,
      rating:     r.rating,
      comment:    r.comment,
      created_at: r.created_at,
      user:       r.users,
    })),
    order_count:  product._count.order_items,
    created_at:   product.created_at,
    updated_at:   product.updated_at,
  });
}

// ── PUT /api/products/[id] ─────────────────────────────────────────────────
// Admin only — updates a product, its variants, and/or images.
//
// Accepts multipart/form-data:
//   Fields (JSON-encoded string in "data"): name?, slug?, description?,
//     category_id?, base_price?, status?, is_active?, variants?,
//     remove_image_ids?[]
//   Files: images[]  (new images to append)
//
// OR application/json (no file upload):
//   Body: { name?, slug?, description?, category_id?, base_price?,
//           status?, is_active?, variants?, remove_image_ids?[] }

export async function PUT(
  request: NextRequest,
  ctx: RouteContext<"/api/products/[id]">
) {
  const role = request.headers.get("x-user-role");
  if (role !== "admin" && role !== "super_admin") {
    return apiError("Forbidden.", 403);
  }

  const userId = request.headers.get("x-user-id");
  const { id } = await ctx.params;

  const existing = await prisma.products.findFirst({
    where: { id, deleted_at: null },
    include: {
      product_images: { where: { deleted_at: null }, select: { id: true, image_url: true, sort_order: true } },
    },
  });

  if (!existing) {
    return apiError("Product not found.", 404);
  }

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
  const parsed = updateProductSchema.safeParse(body);
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
    remove_image_ids,
  } = parsed.data;

  // Nothing to update
  const hasChanges =
    name !== undefined ||
    slugRaw !== undefined ||
    description !== undefined ||
    category_id !== undefined ||
    base_price !== undefined ||
    status !== undefined ||
    is_active !== undefined ||
    variants !== undefined ||
    (remove_image_ids && remove_image_ids.length > 0) ||
    imageFiles.length > 0;

  if (!hasChanges) {
    return apiError("Provide at least one field to update.", 400);
  }

  // Derive slug
  const newSlug = slugRaw?.trim() ?? (name ? toSlug(name) : undefined);

  // Unique slug check (exclude current record)
  if (newSlug && newSlug !== existing.slug) {
    const conflict = await prisma.products.findFirst({
      where: { slug: newSlug, deleted_at: null, NOT: { id } },
    });
    if (conflict) {
      return apiError("A product with this slug already exists.", 409);
    }
  }

  // ── Remove images from storage ────────────────────────────────────────────
  if (remove_image_ids && remove_image_ids.length > 0) {
    const toRemove = existing.product_images.filter((img) =>
      remove_image_ids.includes(img.id)
    );
    // Delete from storage concurrently (non-fatal)
    await Promise.allSettled(toRemove.map((img) => deleteProductImage(img.image_url)));
  }

  // ── Upload new images ─────────────────────────────────────────────────────
  let uploadedImages: { url: string }[] = [];
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

  // Determine next sort_order for new images (based on actual sort_order values, not array index)
  const maxSortOrder = existing.product_images.length > 0
    ? Math.max(...existing.product_images.map((img) => img.sort_order ?? 0))
    : -1;

  // ── Update in a transaction ───────────────────────────────────────────────
  const updated = await prisma.$transaction(async (tx) => {
    // Soft-delete removed images
    if (remove_image_ids && remove_image_ids.length > 0) {
      await tx.product_images.updateMany({
        where: { id: { in: remove_image_ids }, product_id: id },
        data: {
          deleted_at: new Date(),
          deleted_by: userId ?? null,
        },
      });
    }

    // Append new images
    if (uploadedImages.length > 0) {
      await tx.product_images.createMany({
        data: uploadedImages.map((img, idx) => ({
          product_id: id,
          image_url: img.url,
          sort_order: maxSortOrder + 1 + idx,
          created_by: userId ?? null,
          updated_by: userId ?? null,
        })),
      });
    }

    // Upsert variants if provided
    if (variants && variants.length > 0) {
      for (const v of variants) {
        await tx.product_variants.upsert({
          where: {
            product_variants_product_color_size_unique: {
              product_id: id,
              color: v.color,
              size: v.size,
            },
          },
          create: {
            product_id: id,
            sku: v.sku ?? null,
            color: v.color,
            size: v.size,
            price: v.price ?? null,
            is_active: v.is_active,
          },
          update: {
            sku: v.sku ?? null,
            price: v.price ?? null,
            is_active: v.is_active,
            updated_at: new Date(),
          },
        });
      }
    }

    // Update product core fields
    return tx.products.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(newSlug !== undefined && { slug: newSlug }),
        ...(description !== undefined && { description }),
        ...(category_id !== undefined && { category_id }),
        ...(base_price !== undefined && { base_price }),
        ...(status !== undefined && { status }),
        ...(is_active !== undefined && { is_active }),
        updated_by: userId ?? null,
        updated_at: new Date(),
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
        created_by: true,
        updated_by: true,
        categories: { select: { id: true, name: true, slug: true } },
        product_images: {
          where: { deleted_at: null },
          select: { id: true, image_url: true, alt_text: true, sort_order: true },
          orderBy: { sort_order: "asc" },
        },
        product_variants: {
          select: {
            id: true,
            sku: true,
            color: true,
            size: true,
            price: true,
            is_active: true,
          },
        },
      },
    });
  });

  return apiSuccess(updated);
}

// ── DELETE /api/products/[id] ──────────────────────────────────────────────
// Admin only — soft deletes a product (sets deleted_at, deleted_by).
// The product and its images remain in the database but are excluded from
// all public queries. Storage files are NOT deleted (can be cleaned up later).

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext<"/api/products/[id]">
) {
  const role = _req.headers.get("x-user-role");
  if (role !== "admin" && role !== "super_admin") {
    return apiError("Forbidden.", 403);
  }

  const userId = _req.headers.get("x-user-id");
  const { id } = await ctx.params;

  const existing = await prisma.products.findFirst({
    where: { id, deleted_at: null },
  });

  if (!existing) {
    return apiError("Product not found.", 404);
  }

  const now = new Date();

  await prisma.products.update({
    where: { id },
    data: {
      deleted_at: now,
      deleted_by: userId ?? null,
      updated_at: now,
      updated_by: userId ?? null,
      is_active: false,
    },
  });

  return apiSuccess({ id, deleted: true });
}

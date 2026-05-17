import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSuccess, apiError } from "@/lib/auth/response";
import { updateCategorySchema, toSlug } from "@/lib/categories/validation";
import {
  uploadCategoryImage,
  deleteCategoryImage,
} from "@/lib/supabase/storage";

const CATEGORY_SELECT = {
  id: true,
  name: true,
  slug: true,
  image_url: true,
  created_at: true,
  updated_at: true,
} as const;

// ── GET /api/categories/[id] ───────────────────────────────────────────────
// Public — returns a single category by id.

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/categories/[id]">
) {
  const { id } = await ctx.params;

  const category = await prisma.categories.findUnique({
    where: { id },
    select: CATEGORY_SELECT,
  });

  if (!category) {
    return apiError("Category not found.", 404);
  }

  return apiSuccess(category);
}

// ── PUT /api/categories/[id] ───────────────────────────────────────────────
// Admin only — updates name, slug, and/or image of a category.
//
// Accepts EITHER:
//   • multipart/form-data  with fields: name?, slug? + optional file "image"
//                          send remove_image=true to delete the current image
//   • application/json     with fields: name?, slug?, image_url? (null removes)

export async function PUT(
  request: NextRequest,
  ctx: RouteContext<"/api/categories/[id]">
) {
  const role = request.headers.get("x-user-role");
  if (role !== "admin" && role !== "super_admin") {
    return apiError("Forbidden.", 403);
  }

  const { id } = await ctx.params;

  const existing = await prisma.categories.findUnique({ where: { id } });
  if (!existing) {
    return apiError("Category not found.", 404);
  }

  const contentType = request.headers.get("content-type") ?? "";

  let name: string | undefined;
  let slugRaw: string | undefined;
  // undefined = no change, null = remove, string = new URL
  let imageUrl: string | null | undefined = undefined;

  // ── multipart/form-data ──────────────────────────────────────────────────
  if (contentType.includes("multipart/form-data")) {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return apiError("Failed to parse form data.", 400);
    }

    const rawName = formData.get("name") as string | null;
    if (rawName !== null) name = rawName;

    const rawSlug = formData.get("slug") as string | null;
    if (rawSlug !== null) slugRaw = rawSlug;

    const removeImage = formData.get("remove_image") as string | null;
    const imageFile = formData.get("image");

    if (imageFile instanceof File && imageFile.size > 0) {
      // Upload new image, then delete the old one
      try {
        const result = await uploadCategoryImage(imageFile);
        imageUrl = result.url;
      } catch (err) {
        return apiError(
          err instanceof Error ? err.message : "Image upload failed.",
          422
        );
      }
      if (existing.image_url) {
        await deleteCategoryImage(existing.image_url);
      }
    } else if (removeImage === "true") {
      // Explicitly remove image without uploading a new one
      imageUrl = null;
      if (existing.image_url) {
        await deleteCategoryImage(existing.image_url);
      }
    }

  // ── application/json ─────────────────────────────────────────────────────
  } else {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("Invalid JSON body.", 400);
    }

    const parsed = updateCategorySchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        "Validation failed.",
        422,
        parsed.error.flatten().fieldErrors
      );
    }

    name = parsed.data.name;
    slugRaw = parsed.data.slug;

    if ("image_url" in parsed.data) {
      imageUrl = parsed.data.image_url ?? null;
      // If removing the image, clean up storage
      if (imageUrl === null && existing.image_url) {
        await deleteCategoryImage(existing.image_url);
      }
    }
  }

  // Nothing to update
  if (
    name === undefined &&
    slugRaw === undefined &&
    imageUrl === undefined
  ) {
    return apiError(
      "Provide at least one field to update (name, slug, image, or remove_image).",
      400
    );
  }

  // Derive slug from new name when only name is changed
  const newSlug = slugRaw?.trim() ?? (name ? toSlug(name) : undefined);

  // Unique slug check (exclude current record)
  if (newSlug && newSlug !== existing.slug) {
    const conflict = await prisma.categories.findFirst({
      where: { slug: newSlug, NOT: { id } },
    });
    if (conflict) {
      return apiError("A category with this slug already exists.", 409);
    }
  }

  const updated = await prisma.categories.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(newSlug !== undefined && { slug: newSlug }),
      ...(imageUrl !== undefined && { image_url: imageUrl }),
      updated_at: new Date(),
    },
    select: CATEGORY_SELECT,
  });

  return apiSuccess(updated);
}

// ── DELETE /api/categories/[id] ────────────────────────────────────────────
// Admin only — deletes a category and its image from storage.

export async function DELETE(
  request: NextRequest,
  ctx: RouteContext<"/api/categories/[id]">
) {
  const role = request.headers.get("x-user-role");
  if (role !== "admin" && role !== "super_admin") {
    return apiError("Forbidden.", 403);
  }

  const { id } = await ctx.params;

  const existing = await prisma.categories.findUnique({ where: { id } });
  if (!existing) {
    return apiError("Category not found.", 404);
  }

  // Delete image from storage first (non-fatal if it fails)
  if (existing.image_url) {
    await deleteCategoryImage(existing.image_url);
  }

  await prisma.categories.delete({ where: { id } });

  return apiSuccess({ id, deleted: true });
}

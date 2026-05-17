import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSuccess, apiError } from "@/lib/auth/response";
import { createCategorySchema, toSlug } from "@/lib/categories/validation";
import {
  uploadCategoryImage,
} from "@/lib/supabase/storage";

// ── GET /api/categories ────────────────────────────────────────────────────
// Public — returns all categories ordered by name.

export async function GET() {
  const categories = await prisma.categories.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      image_url: true,
      created_at: true,
      updated_at: true,
    },
  });

  return apiSuccess(categories);
}

// ── POST /api/categories ───────────────────────────────────────────────────
// Admin only — creates a new category.
//
// Accepts EITHER:
//   • multipart/form-data  with fields: name, slug? + file field "image"
//   • application/json     with fields: name, slug?, image_url?
//
// When an "image" file is uploaded it is stored in Supabase Storage and the
// resulting public URL is saved as image_url.

export async function POST(request: NextRequest) {
  const role = request.headers.get("x-user-role");
  if (role !== "admin" && role !== "super_admin") {
    return apiError("Forbidden.", 403);
  }

  const contentType = request.headers.get("content-type") ?? "";
  let name: string | undefined;
  let slugRaw: string | undefined;
  let imageUrl: string | null = null;

  // ── multipart/form-data ──────────────────────────────────────────────────
  if (contentType.includes("multipart/form-data")) {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return apiError("Failed to parse form data.", 400);
    }

    name = formData.get("name") as string | undefined;
    slugRaw = formData.get("slug") as string | undefined;

    const imageFile = formData.get("image");
    if (imageFile instanceof File && imageFile.size > 0) {
      try {
        const result = await uploadCategoryImage(imageFile);
        imageUrl = result.url;
      } catch (err) {
        return apiError(
          err instanceof Error ? err.message : "Image upload failed.",
          422
        );
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

    const parsed = createCategorySchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        "Validation failed.",
        422,
        parsed.error.flatten().fieldErrors
      );
    }

    name = parsed.data.name;
    slugRaw = parsed.data.slug;
    imageUrl = parsed.data.image_url ?? null;
  }

  // Validate required fields from form-data path
  if (!name || name.trim().length < 2) {
    return apiError("name must be at least 2 characters.", 422);
  }

  const slug = slugRaw?.trim() || toSlug(name);

  const existing = await prisma.categories.findFirst({ where: { slug } });
  if (existing) {
    return apiError("A category with this slug already exists.", 409);
  }

  const category = await prisma.categories.create({
    data: { name: name.trim(), slug, image_url: imageUrl },
    select: {
      id: true,
      name: true,
      slug: true,
      image_url: true,
      created_at: true,
      updated_at: true,
    },
  });

  return apiSuccess(category, 201);
}

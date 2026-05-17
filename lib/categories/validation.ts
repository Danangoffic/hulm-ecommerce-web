import { z } from "zod";

/** Convert a string to a URL-safe slug */
export function toSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")   // strip non-word chars (except spaces and hyphens)
    .replace(/[\s_]+/g, "-")    // spaces/underscores → hyphens
    .replace(/-{2,}/g, "-")     // collapse multiple hyphens
    .replace(/^-+|-+$/g, "");   // trim leading/trailing hyphens
}

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const createCategorySchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  /** Optional — auto-generated from name when omitted */
  slug: z
    .string()
    .regex(slugRegex, "Slug must be lowercase alphanumeric with hyphens")
    .max(120)
    .optional(),
  /** Optional — URL of the category image */
  image_url: z.url("image_url must be a valid URL").optional().nullable(),
});

export const updateCategorySchema = z.object({
  name: z.string().min(2).max(100).optional(),
  slug: z
    .string()
    .regex(slugRegex, "Slug must be lowercase alphanumeric with hyphens")
    .max(120)
    .optional(),
  /** Pass null to remove the image */
  image_url: z.url("image_url must be a valid URL").optional().nullable(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

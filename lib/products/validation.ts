import { z } from "zod";

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Convert a string to a URL-safe slug */
export function toSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ── Variant schema ─────────────────────────────────────────────────────────

export const variantSchema = z.object({
  /** Optional — auto-generated if omitted */
  sku: z.string().max(100).optional().nullable(),
  color: z.string().min(1, "color is required").max(50),
  size: z.string().min(1, "size is required").max(20),
  /** Override price — falls back to product base_price when null */
  price: z.number().positive("price must be positive").optional().nullable(),
  is_active: z.boolean().optional().default(true),
});

export type VariantInput = z.infer<typeof variantSchema>;

// ── Create product schema (JSON body — images handled separately) ──────────

export const createProductSchema = z.object({
  name: z.string().min(2, "name must be at least 2 characters").max(200),
  /** Optional — auto-generated from name when omitted */
  slug: z
    .string()
    .regex(slugRegex, "slug must be lowercase alphanumeric with hyphens")
    .max(220)
    .optional(),
  description: z.string().max(5000).optional().nullable(),
  category_id: z.string().pipe(z.uuid()).optional().nullable(),
  base_price: z.number().positive("base_price must be positive"),
  status: z.enum(["draft", "published", "archived"]).optional().default("published"),
  is_active: z.boolean().optional().default(true),
  /** Variants — at least one required */
  variants: z
    .array(variantSchema)
    .min(1, "at least one variant is required"),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

// ── Update product schema ──────────────────────────────────────────────────

export const updateProductSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  slug: z
    .string()
    .regex(slugRegex, "slug must be lowercase alphanumeric with hyphens")
    .max(220)
    .optional(),
  description: z.string().max(5000).optional().nullable(),
  category_id: z.string().pipe(z.uuid()).optional().nullable(),
  base_price: z.number().positive().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  is_active: z.boolean().optional(),
  /**
   * Variants to upsert (create or update by sku / color+size).
   * Omit to leave variants unchanged.
   */
  variants: z.array(variantSchema).optional(),
  /**
   * IDs of product_images rows to remove.
   * The files will be deleted from storage and the rows removed.
   */
  remove_image_ids: z.array(z.uuid()).optional(),
});

export type UpdateProductInput = z.infer<typeof updateProductSchema>;

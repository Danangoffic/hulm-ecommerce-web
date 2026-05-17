import { describe, it, expect } from "vitest";
import { createProductSchema, updateProductSchema, variantSchema, toSlug } from "@/lib/products/validation";

// ── toSlug ─────────────────────────────────────────────────────────────────

describe("toSlug", () => {
  it("lowercases and trims", () => {
    expect(toSlug("  Jaket Parka  ")).toBe("jaket-parka");
  });

  it("replaces spaces with hyphens", () => {
    expect(toSlug("jaket parka coklat")).toBe("jaket-parka-coklat");
  });

  it("collapses multiple spaces/hyphens", () => {
    expect(toSlug("jaket  --  parka")).toBe("jaket-parka");
  });

  it("strips special characters", () => {
    expect(toSlug("jaket & parka (2024)")).toBe("jaket-parka-2024");
  });

  it("handles underscores as hyphens", () => {
    expect(toSlug("jaket_parka")).toBe("jaket-parka");
  });

  it("trims leading and trailing hyphens", () => {
    expect(toSlug("--jaket--")).toBe("jaket");
  });
});

// ── variantSchema ──────────────────────────────────────────────────────────

describe("variantSchema", () => {
  it("accepts valid variant", () => {
    const result = variantSchema.safeParse({ color: "coklat", size: "M" });
    expect(result.success).toBe(true);
  });

  it("accepts variant with all optional fields", () => {
    const result = variantSchema.safeParse({
      sku: "JKT-COKLAT-M",
      color: "coklat",
      size: "M",
      price: 250000,
      is_active: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing color", () => {
    const result = variantSchema.safeParse({ size: "M" });
    expect(result.success).toBe(false);
  });

  it("rejects missing size", () => {
    const result = variantSchema.safeParse({ color: "coklat" });
    expect(result.success).toBe(false);
  });

  it("rejects negative price", () => {
    const result = variantSchema.safeParse({ color: "coklat", size: "M", price: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects zero price", () => {
    const result = variantSchema.safeParse({ color: "coklat", size: "M", price: 0 });
    expect(result.success).toBe(false);
  });

  it("allows null price (falls back to base_price)", () => {
    const result = variantSchema.safeParse({ color: "coklat", size: "M", price: null });
    expect(result.success).toBe(true);
  });

  it("defaults is_active to true", () => {
    const result = variantSchema.safeParse({ color: "coklat", size: "M" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.is_active).toBe(true);
  });
});

// ── createProductSchema ────────────────────────────────────────────────────

describe("createProductSchema", () => {
  const validPayload = {
    name: "Jaket Parka",
    base_price: 350000,
    variants: [{ color: "coklat", size: "M" }],
  };

  it("accepts minimal valid payload", () => {
    const result = createProductSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it("accepts full payload", () => {
    const result = createProductSchema.safeParse({
      name: "Jaket Parka",
      slug: "jaket-parka",
      description: "Jaket parka premium",
      category_id: "550e8400-e29b-41d4-a716-446655440000",
      base_price: 350000,
      status: "published",
      is_active: true,
      variants: [
        { color: "coklat", size: "S" },
        { color: "coklat", size: "M" },
        { color: "olive", size: "XL" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("defaults status to published", () => {
    const result = createProductSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.status).toBe("published");
  });

  it("defaults is_active to true", () => {
    const result = createProductSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.is_active).toBe(true);
  });

  it("rejects name shorter than 2 chars", () => {
    const result = createProductSchema.safeParse({ ...validPayload, name: "J" });
    expect(result.success).toBe(false);
  });

  it("rejects missing base_price", () => {
    const { base_price: _, ...rest } = validPayload;
    const result = createProductSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects zero base_price", () => {
    const result = createProductSchema.safeParse({ ...validPayload, base_price: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects negative base_price", () => {
    const result = createProductSchema.safeParse({ ...validPayload, base_price: -100 });
    expect(result.success).toBe(false);
  });

  it("rejects empty variants array", () => {
    const result = createProductSchema.safeParse({ ...validPayload, variants: [] });
    expect(result.success).toBe(false);
  });

  it("rejects missing variants", () => {
    const { variants: _, ...rest } = validPayload;
    const result = createProductSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects invalid slug format", () => {
    const result = createProductSchema.safeParse({ ...validPayload, slug: "Jaket Parka" });
    expect(result.success).toBe(false);
  });

  it("accepts valid slug", () => {
    const result = createProductSchema.safeParse({ ...validPayload, slug: "jaket-parka-2024" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status", () => {
    const result = createProductSchema.safeParse({ ...validPayload, status: "active" });
    expect(result.success).toBe(false);
  });

  it("accepts all valid status values", () => {
    for (const status of ["draft", "published", "archived"]) {
      const result = createProductSchema.safeParse({ ...validPayload, status });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid category_id (not a UUID)", () => {
    const result = createProductSchema.safeParse({ ...validPayload, category_id: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("allows null category_id", () => {
    const result = createProductSchema.safeParse({ ...validPayload, category_id: null });
    expect(result.success).toBe(true);
  });
});

// ── updateProductSchema ────────────────────────────────────────────────────

describe("updateProductSchema", () => {
  it("accepts empty object (all fields optional)", () => {
    const result = updateProductSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts partial update — name only", () => {
    const result = updateProductSchema.safeParse({ name: "Jaket Baru" });
    expect(result.success).toBe(true);
  });

  it("accepts remove_image_ids as UUID array", () => {
    const result = updateProductSchema.safeParse({
      remove_image_ids: ["550e8400-e29b-41d4-a716-446655440000"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects remove_image_ids with non-UUID strings", () => {
    const result = updateProductSchema.safeParse({
      remove_image_ids: ["not-a-uuid"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects name shorter than 2 chars", () => {
    const result = updateProductSchema.safeParse({ name: "J" });
    expect(result.success).toBe(false);
  });

  it("rejects negative base_price", () => {
    const result = updateProductSchema.safeParse({ base_price: -1 });
    expect(result.success).toBe(false);
  });
});

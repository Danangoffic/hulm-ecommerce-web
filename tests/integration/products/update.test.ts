import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    products: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    product_images: {
      updateMany: vi.fn(),
      createMany: vi.fn(),
    },
    product_variants: {
      upsert: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/storage", () => ({
  uploadProductImages: vi.fn(),
  deleteProductImage: vi.fn(),
}));

import { PUT, DELETE } from "@/app/api/products/[id]/route";
import { prisma } from "@/lib/prisma";
import { uploadProductImages, deleteProductImage } from "@/lib/supabase/storage";

const mock = prisma as {
  products: { findFirst: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  product_images: { updateMany: ReturnType<typeof vi.fn>; createMany: ReturnType<typeof vi.fn> };
  product_variants: { upsert: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};
const mockUpload = uploadProductImages as ReturnType<typeof vi.fn>;
const mockDelete = deleteProductImage as ReturnType<typeof vi.fn>;

// ── Fixtures ───────────────────────────────────────────────────────────────

const PRODUCT_ID = "550e8400-e29b-41d4-a716-446655440001";
const ADMIN_HEADERS = { "x-user-role": "admin", "x-user-id": "admin-uuid" };

const existingProduct = {
  id: PRODUCT_ID,
  name: "Jaket Parka",
  slug: "jaket-parka",
  description: null,
  base_price: "350000",
  status: "published",
  is_active: true,
  category_id: null,
  deleted_at: null,
  product_images: [
    { id: "img-1", image_url: "https://storage.example.com/img1.jpg", sort_order: 0 },
    { id: "img-2", image_url: "https://storage.example.com/img2.jpg", sort_order: 1 },
  ],
};

const updatedProduct = {
  ...existingProduct,
  name: "Jaket Parka Updated",
  updated_at: new Date(),
  created_by: null,
  updated_by: "admin-uuid",
  categories: null,
  product_images: existingProduct.product_images,
  product_variants: [],
};

function makeJsonRequest(id: string, body: unknown, headers = ADMIN_HEADERS): NextRequest {
  return new NextRequest(`http://localhost/api/products/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function makeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: product found. Slug conflict check returns null (no conflict).
  // Tests that need different behavior should call mock.products.findFirst.mockReset() first.
  mock.products.findFirst.mockResolvedValue(existingProduct);
  mock.products.update.mockResolvedValue(updatedProduct);
  mock.product_images.updateMany.mockResolvedValue({ count: 0 });
  mock.product_images.createMany.mockResolvedValue({ count: 0 });
  mock.product_variants.upsert.mockResolvedValue({});
  mockUpload.mockResolvedValue([]);
  mockDelete.mockResolvedValue(undefined);
  // $transaction passes a tx object that mirrors the mocked prisma models
  mock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      products: mock.products,
      product_images: mock.product_images,
      product_variants: mock.product_variants,
    };
    return fn(tx);
  });
});

// ── PUT /api/products/[id] ─────────────────────────────────────────────────

describe("PUT /api/products/:id", () => {

  // ── Auth ───────────────────────────────────────────────────────────────

  it("403 — no role header", async () => {
    const res = await PUT(makeJsonRequest(PRODUCT_ID, { name: "New" }, {}), makeCtx(PRODUCT_ID));
    expect(res.status).toBe(403);
  });

  it("403 — customer role", async () => {
    const res = await PUT(
      makeJsonRequest(PRODUCT_ID, { name: "New" }, { "x-user-role": "customer" }),
      makeCtx(PRODUCT_ID)
    );
    expect(res.status).toBe(403);
  });

  // ── Not found ──────────────────────────────────────────────────────────

  it("404 — product not found", async () => {
    mock.products.findFirst.mockReset();
    mock.products.findFirst.mockResolvedValue(null);

    const res = await PUT(makeJsonRequest(PRODUCT_ID, { name: "New" }), makeCtx(PRODUCT_ID));
    expect(res.status).toBe(404);
  });  // ── Happy path ─────────────────────────────────────────────────────────

  it("200 — updates product name", async () => {
    // name "Jaket Parka Updated" → slug "jaket-parka-updated" ≠ existing "jaket-parka"
    // so conflict check runs — mock second call as null (no conflict)
    mock.products.findFirst
      .mockResolvedValueOnce(existingProduct)
      .mockResolvedValueOnce(null);
    const res = await PUT(makeJsonRequest(PRODUCT_ID, { name: "Jaket Parka Updated" }), makeCtx(PRODUCT_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("200 — sets updated_by from x-user-id header", async () => {
    mock.products.findFirst
      .mockResolvedValueOnce(existingProduct)
      .mockResolvedValueOnce(null);
    await PUT(makeJsonRequest(PRODUCT_ID, { name: "New Name" }), makeCtx(PRODUCT_ID));

    const updateArg = mock.products.update.mock.calls[0][0].data;
    expect(updateArg.updated_by).toBe("admin-uuid");
  });

  it("200 — auto-derives slug from new name", async () => {
    mock.products.findFirst
      .mockResolvedValueOnce(existingProduct)
      .mockResolvedValueOnce(null);
    await PUT(makeJsonRequest(PRODUCT_ID, { name: "Jaket Baru" }), makeCtx(PRODUCT_ID));

    const updateArg = mock.products.update.mock.calls[0][0].data;
    expect(updateArg.slug).toBe("jaket-baru");
  });

  it("200 — uses explicit slug when provided", async () => {
    mock.products.findFirst
      .mockResolvedValueOnce(existingProduct)
      .mockResolvedValueOnce(null);
    await PUT(makeJsonRequest(PRODUCT_ID, { slug: "custom-slug" }), makeCtx(PRODUCT_ID));

    const updateArg = mock.products.update.mock.calls[0][0].data;
    expect(updateArg.slug).toBe("custom-slug");
  });

  // ── Slug conflict ──────────────────────────────────────────────────────

  it("409 — new slug conflicts with another product", async () => {
    mock.products.findFirst.mockReset();
    mock.products.findFirst
      .mockResolvedValueOnce(existingProduct)   // first call: find current product
      .mockResolvedValueOnce({ id: "other-id", slug: "jaket-baru" }); // second: conflict check

    const res = await PUT(makeJsonRequest(PRODUCT_ID, { name: "Jaket Baru" }), makeCtx(PRODUCT_ID));
    expect(res.status).toBe(409);
  });

  it("200 — same slug as current product does not trigger conflict", async () => {
    // slug unchanged — no conflict check needed
    const res = await PUT(makeJsonRequest(PRODUCT_ID, { name: "Jaket Parka" }), makeCtx(PRODUCT_ID));
    // slug derived from "Jaket Parka" = "jaket-parka" which equals existing.slug
    expect(res.status).toBe(200);
  });

  // ── Nothing to update ──────────────────────────────────────────────────

  it("400 — empty body with no changes", async () => {
    const res = await PUT(makeJsonRequest(PRODUCT_ID, {}), makeCtx(PRODUCT_ID));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain("at least one field");
  });

  // ── Variants upsert ────────────────────────────────────────────────────

  it("200 — upserts each variant", async () => {
    await PUT(
      makeJsonRequest(PRODUCT_ID, {
        variants: [
          { color: "coklat", size: "S" },
          { color: "olive", size: "XL" },
        ],
      }),
      makeCtx(PRODUCT_ID)
    );

    expect(mock.product_variants.upsert).toHaveBeenCalledTimes(2);
  });

  // ── Image removal ──────────────────────────────────────────────────────

  it("200 — soft-deletes images by ID", async () => {
    const validImgId = "550e8400-e29b-41d4-a716-446655440099";
    // Override existing product to use a valid UUID for image id
    mock.products.findFirst.mockResolvedValue({
      ...existingProduct,
      product_images: [
        { id: validImgId, image_url: "https://storage.example.com/img1.jpg", sort_order: 0 },
      ],
    });

    await PUT(
      makeJsonRequest(PRODUCT_ID, { remove_image_ids: [validImgId] }),
      makeCtx(PRODUCT_ID)
    );

    expect(mock.product_images.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: [validImgId] } }),
        data: expect.objectContaining({ deleted_at: expect.any(Date) }),
      })
    );
  });

  it("200 — deletes image from storage when removing", async () => {
    const validImgId = "550e8400-e29b-41d4-a716-446655440099";
    mock.products.findFirst.mockResolvedValue({
      ...existingProduct,
      product_images: [
        { id: validImgId, image_url: "https://storage.example.com/img1.jpg", sort_order: 0 },
      ],
    });

    await PUT(
      makeJsonRequest(PRODUCT_ID, { remove_image_ids: [validImgId] }),
      makeCtx(PRODUCT_ID)
    );

    expect(mockDelete).toHaveBeenCalledWith("https://storage.example.com/img1.jpg");
  });

  it("200 — does not call deleteProductImage for IDs not in product", async () => {
    await PUT(
      makeJsonRequest(PRODUCT_ID, { remove_image_ids: ["550e8400-e29b-41d4-a716-000000000000"] }),
      makeCtx(PRODUCT_ID)
    );

    expect(mockDelete).not.toHaveBeenCalled();
  });

  // ── Image upload ───────────────────────────────────────────────────────

  it("200 — appends new images with correct sort_order", async () => {
    mockUpload.mockResolvedValue([
      { url: "https://storage.example.com/img3.jpg", path: "img3.jpg" },
    ]);
    // "Updated" → slug "updated" ≠ "jaket-parka", so conflict check runs
    mock.products.findFirst
      .mockResolvedValueOnce(existingProduct)
      .mockResolvedValueOnce(null);

    const formData = new FormData();
    formData.append("data", JSON.stringify({ name: "Updated" }));
    formData.append("images", new File(["x"], "img3.jpg", { type: "image/jpeg" }));

    const req = new NextRequest(`http://localhost/api/products/${PRODUCT_ID}`, {
      method: "PUT",
      headers: { ...ADMIN_HEADERS },
      body: formData,
    });
    await PUT(req, makeCtx(PRODUCT_ID));

    const createManyArg = mock.product_images.createMany.mock.calls[0][0].data;
    // existing max sort_order is 1, so new image should be sort_order 2
    expect(createManyArg[0].sort_order).toBe(2);
    expect(createManyArg[0].image_url).toBe("https://storage.example.com/img3.jpg");
  });

  it("422 — image upload failure returns error", async () => {
    mockUpload.mockRejectedValue(new Error("Invalid file type"));
    // "Updated" → slug conflict check runs, return null
    mock.products.findFirst
      .mockResolvedValueOnce(existingProduct)
      .mockResolvedValueOnce(null);

    const formData = new FormData();
    formData.append("data", JSON.stringify({ name: "Updated" }));
    formData.append("images", new File(["x"], "doc.pdf", { type: "application/pdf" }));

    const req = new NextRequest(`http://localhost/api/products/${PRODUCT_ID}`, {
      method: "PUT",
      headers: { ...ADMIN_HEADERS },
      body: formData,
    });
    const res = await PUT(req, makeCtx(PRODUCT_ID));
    expect(res.status).toBe(422);
  });

  // ── Validation ─────────────────────────────────────────────────────────

  it("422 — invalid base_price", async () => {
    const res = await PUT(makeJsonRequest(PRODUCT_ID, { base_price: -100 }), makeCtx(PRODUCT_ID));
    expect(res.status).toBe(422);
  });

  it("400 — malformed JSON", async () => {
    const req = new NextRequest(`http://localhost/api/products/${PRODUCT_ID}`, {
      method: "PUT",
      headers: { "content-type": "application/json", ...ADMIN_HEADERS },
      body: "not json",
    });
    const res = await PUT(req, makeCtx(PRODUCT_ID));
    expect(res.status).toBe(400);
  });
});

// ── DELETE /api/products/[id] ──────────────────────────────────────────────

describe("DELETE /api/products/:id", () => {

  function makeDeleteRequest(id: string, headers = ADMIN_HEADERS): NextRequest {
    return new NextRequest(`http://localhost/api/products/${id}`, {
      method: "DELETE",
      headers,
    });
  }

  // ── Auth ───────────────────────────────────────────────────────────────

  it("403 — no role header", async () => {
    const res = await DELETE(makeDeleteRequest(PRODUCT_ID, {}), makeCtx(PRODUCT_ID));
    expect(res.status).toBe(403);
  });

  it("403 — customer role", async () => {
    const res = await DELETE(
      makeDeleteRequest(PRODUCT_ID, { "x-user-role": "customer" }),
      makeCtx(PRODUCT_ID)
    );
    expect(res.status).toBe(403);
  });

  // ── Not found ──────────────────────────────────────────────────────────

  it("404 — product not found", async () => {
    mock.products.findFirst.mockReset();
    mock.products.findFirst.mockResolvedValue(null);

    const res = await DELETE(makeDeleteRequest(PRODUCT_ID), makeCtx(PRODUCT_ID));
    expect(res.status).toBe(404);
  });

  // ── Soft delete ────────────────────────────────────────────────────────

  it("200 — soft deletes product (sets deleted_at)", async () => {
    const res = await DELETE(makeDeleteRequest(PRODUCT_ID), makeCtx(PRODUCT_ID));
    expect(res.status).toBe(200);

    const updateArg = mock.products.update.mock.calls[0][0].data;
    expect(updateArg.deleted_at).toBeInstanceOf(Date);
    expect(updateArg.is_active).toBe(false);
  });

  it("200 — sets deleted_by from x-user-id header", async () => {
    mock.products.findFirst.mockResolvedValue(existingProduct);
    mock.products.update.mockResolvedValue({ id: PRODUCT_ID });

    await DELETE(
      makeDeleteRequest(PRODUCT_ID, { "x-user-role": "admin", "x-user-id": "admin-uuid-123" }),
      makeCtx(PRODUCT_ID)
    );

    const updateArg = mock.products.update.mock.calls[0][0].data;
    expect(updateArg.deleted_by).toBe("admin-uuid-123");
  });

  it("200 — response contains id and deleted:true", async () => {
    mock.products.findFirst.mockResolvedValue(existingProduct);
    mock.products.update.mockResolvedValue({ id: PRODUCT_ID });

    const res = await DELETE(makeDeleteRequest(PRODUCT_ID), makeCtx(PRODUCT_ID));
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.data.id).toBe(PRODUCT_ID);
    expect(body.data.deleted).toBe(true);
  });

  it("200 — does NOT hard delete from database", async () => {
    mock.products.findFirst.mockResolvedValue(existingProduct);
    mock.products.update.mockResolvedValue({ id: PRODUCT_ID });

    await DELETE(makeDeleteRequest(PRODUCT_ID), makeCtx(PRODUCT_ID));

    // Should call update, not delete
    expect(mock.products.update).toHaveBeenCalledOnce();
    // prisma.products.delete should not exist / not be called
    expect((prisma.products as Record<string, unknown>).delete).toBeUndefined();
  });

  it("200 — super_admin can also soft delete", async () => {
    mock.products.findFirst.mockResolvedValue(existingProduct);
    mock.products.update.mockResolvedValue({ id: PRODUCT_ID });

    const res = await DELETE(
      makeDeleteRequest(PRODUCT_ID, { "x-user-role": "super_admin", "x-user-id": "super-uuid" }),
      makeCtx(PRODUCT_ID)
    );
    expect(res.status).toBe(200);
  });
});

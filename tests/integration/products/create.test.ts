import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    products: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/storage", () => ({
  uploadProductImages: vi.fn(),
}));

import { POST } from "@/app/api/products/route";
import { prisma } from "@/lib/prisma";
import { uploadProductImages } from "@/lib/supabase/storage";

const mock = prisma as {
  products: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};
const mockUpload = uploadProductImages as ReturnType<typeof vi.fn>;

// ── Fixtures ───────────────────────────────────────────────────────────────

const ADMIN_HEADERS = { "x-user-role": "admin", "x-user-id": "admin-uuid" };

const validBody = {
  name: "Jaket Parka",
  base_price: 350000,
  variants: [{ color: "coklat", size: "M" }],
};

const createdProduct = {
  id: "new-product-uuid",
  name: "Jaket Parka",
  slug: "jaket-parka",
  description: null,
  base_price: "350000",
  status: "published",
  is_active: true,
  category_id: null,
  created_at: new Date(),
  updated_at: new Date(),
  categories: null,
  product_images: [],
  product_variants: [{ id: "var-1", sku: null, color: "coklat", size: "M", price: null, is_active: true }],
};

function makeJsonRequest(body: unknown, headers: Record<string, string> = ADMIN_HEADERS): NextRequest {
  return new NextRequest("http://localhost/api/products", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.products.findFirst.mockResolvedValue(null); // no slug conflict
  mock.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) =>
    fn(prisma)
  );
  mock.products.create = vi.fn().mockResolvedValue(createdProduct);
  mockUpload.mockResolvedValue([]);
});

// ── POST /api/products ─────────────────────────────────────────────────────

describe("POST /api/products", () => {

  // ── Auth ───────────────────────────────────────────────────────────────

  it("403 — no role header", async () => {
    const res = await POST(makeJsonRequest(validBody, {}));
    expect(res.status).toBe(403);
  });

  it("403 — customer role", async () => {
    const res = await POST(makeJsonRequest(validBody, { "x-user-role": "customer" }));
    expect(res.status).toBe(403);
  });

  it("201 — admin role allowed", async () => {
    const res = await POST(makeJsonRequest(validBody, { "x-user-role": "admin" }));
    expect(res.status).toBe(201);
  });

  it("201 — super_admin role allowed", async () => {
    const res = await POST(makeJsonRequest(validBody, { "x-user-role": "super_admin" }));
    expect(res.status).toBe(201);
  });

  // ── Happy path ─────────────────────────────────────────────────────────

  it("201 — creates product and returns it", async () => {
    const res = await POST(makeJsonRequest(validBody));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("Jaket Parka");
  });

  it("201 — auto-generates slug from name when not provided", async () => {
    await POST(makeJsonRequest(validBody));

    const createArg = mock.products.create.mock.calls[0][0].data;
    expect(createArg.slug).toBe("jaket-parka");
  });

  it("201 — uses provided slug when given", async () => {
    await POST(makeJsonRequest({ ...validBody, slug: "custom-slug" }));

    const createArg = mock.products.create.mock.calls[0][0].data;
    expect(createArg.slug).toBe("custom-slug");
  });

  it("201 — sets created_by from x-user-id header", async () => {
    await POST(makeJsonRequest(validBody, { "x-user-role": "admin", "x-user-id": "admin-uuid-123" }));

    const createArg = mock.products.create.mock.calls[0][0].data;
    expect(createArg.created_by).toBe("admin-uuid-123");
    expect(createArg.updated_by).toBe("admin-uuid-123");
  });

  it("201 — creates variants from payload", async () => {
    const body = {
      ...validBody,
      variants: [
        { color: "coklat", size: "S" },
        { color: "coklat", size: "M" },
        { color: "olive", size: "XL" },
      ],
    };
    await POST(makeJsonRequest(body));

    const createArg = mock.products.create.mock.calls[0][0].data;
    expect(createArg.product_variants.create).toHaveLength(3);
  });

  // ── Slug conflict ──────────────────────────────────────────────────────

  it("409 — slug already exists", async () => {
    mock.products.findFirst.mockResolvedValue({ id: "existing-id", slug: "jaket-parka" });

    const res = await POST(makeJsonRequest(validBody));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.message).toContain("slug already exists");
  });

  // ── Validation errors ──────────────────────────────────────────────────

  it("422 — missing name", async () => {
    const { name: _, ...rest } = validBody;
    const res = await POST(makeJsonRequest(rest));
    expect(res.status).toBe(422);
  });

  it("422 — missing base_price", async () => {
    const { base_price: _, ...rest } = validBody;
    const res = await POST(makeJsonRequest(rest));
    expect(res.status).toBe(422);
  });

  it("422 — empty variants array", async () => {
    const res = await POST(makeJsonRequest({ ...validBody, variants: [] }));
    expect(res.status).toBe(422);
  });

  it("422 — invalid status value", async () => {
    const res = await POST(makeJsonRequest({ ...validBody, status: "active" }));
    expect(res.status).toBe(422);
  });

  it("400 — malformed JSON", async () => {
    const req = new NextRequest("http://localhost/api/products", {
      method: "POST",
      headers: { "content-type": "application/json", ...ADMIN_HEADERS },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // ── Multipart form-data ────────────────────────────────────────────────

  it("400 — multipart without 'data' field", async () => {
    const formData = new FormData();
    formData.append("name", "Jaket");

    const req = new NextRequest("http://localhost/api/products", {
      method: "POST",
      headers: { ...ADMIN_HEADERS },
      body: formData,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain('"data" field');
  });

  it("400 — multipart with invalid JSON in 'data' field", async () => {
    const formData = new FormData();
    formData.append("data", "not json");

    const req = new NextRequest("http://localhost/api/products", {
      method: "POST",
      headers: { ...ADMIN_HEADERS },
      body: formData,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // ── Image upload ───────────────────────────────────────────────────────

  it("422 — image upload failure returns error", async () => {
    mockUpload.mockRejectedValue(new Error("File too large (3.0 MB). Max 2 MB."));

    const formData = new FormData();
    formData.append("data", JSON.stringify(validBody));
    const fakeFile = new File(["x".repeat(100)], "photo.jpg", { type: "image/jpeg" });
    formData.append("images", fakeFile);

    const req = new NextRequest("http://localhost/api/products", {
      method: "POST",
      headers: { ...ADMIN_HEADERS },
      body: formData,
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.message).toContain("too large");
  });

  it("201 — uploaded image URLs are saved to product_images", async () => {
    mockUpload.mockResolvedValue([
      { url: "https://storage.example.com/img1.jpg", path: "img1.jpg" },
      { url: "https://storage.example.com/img2.jpg", path: "img2.jpg" },
    ]);

    const formData = new FormData();
    formData.append("data", JSON.stringify(validBody));
    formData.append("images", new File(["x"], "img1.jpg", { type: "image/jpeg" }));
    formData.append("images", new File(["x"], "img2.jpg", { type: "image/jpeg" }));

    const req = new NextRequest("http://localhost/api/products", {
      method: "POST",
      headers: { ...ADMIN_HEADERS },
      body: formData,
    });
    await POST(req);

    const createArg = mock.products.create.mock.calls[0][0].data;
    expect(createArg.product_images.create).toHaveLength(2);
    expect(createArg.product_images.create[0].image_url).toBe("https://storage.example.com/img1.jpg");
    expect(createArg.product_images.create[0].sort_order).toBe(0);
    expect(createArg.product_images.create[1].sort_order).toBe(1);
  });
});

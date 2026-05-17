import { prisma } from "@/lib/prisma";
import { apiSuccess } from "@/lib/auth/response";

// ── GET /api/public/categories ─────────────────────────────────────────────
// Public — list semua kategori aktif beserta jumlah produk yang dipublish.

export async function GET() {
  const categories = await prisma.categories.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      image_url: true,
      // Hitung hanya produk yang aktif dan published
      _count: {
        select: {
          products: {
            where: {
              is_active: true,
              status: "published",
              deleted_at: null,
            },
          },
        },
      },
    },
  });

  const data = categories.map((cat) => ({
    id: cat.id,
    name: cat.name,
    slug: cat.slug,
    image_url: cat.image_url,
    product_count: cat._count.products,
  }));

  return apiSuccess(data);
}

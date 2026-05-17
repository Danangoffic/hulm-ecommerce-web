import Link from "next/link";
import Image from "next/image";

// ── Static placeholder data ────────────────────────────────────────────────
// Replace with real DB queries once the data layer is wired up.

const CATEGORIES = [
  { name: "Atasan", slug: "atasan", emoji: "👕", image_url: null },
  { name: "Bawahan", slug: "bawahan", emoji: "👖", image_url: null },
  { name: "Sepatu", slug: "sepatu", emoji: "👟", image_url: null },
  { name: "Aksesori", slug: "aksesori", emoji: "👜", image_url: null },
];

const FEATURED_PRODUCTS = [
  {
    id: "1",
    name: "Kaos Polos Premium",
    slug: "kaos-polos-premium",
    base_price: 149000,
    category: "Atasan",
    image_placeholder: "bg-stone-200",
  },
  {
    id: "2",
    name: "Celana Chino Slim",
    slug: "celana-chino-slim",
    base_price: 299000,
    category: "Bawahan",
    image_placeholder: "bg-slate-200",
  },
  {
    id: "3",
    name: "Sneakers Kasual",
    slug: "sneakers-kasual",
    base_price: 499000,
    category: "Sepatu",
    image_placeholder: "bg-zinc-200",
  },
  {
    id: "4",
    name: "Tote Bag Canvas",
    slug: "tote-bag-canvas",
    base_price: 189000,
    category: "Aksesori",
    image_placeholder: "bg-neutral-200",
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <div className="flex flex-col gap-16 pb-16">
      {/* ── Hero ── */}
      <section className="relative flex min-h-[480px] items-center justify-center overflow-hidden bg-gray-900 px-6 text-white">
        {/* Background gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700" />

        <div className="relative z-10 mx-auto max-w-2xl text-center">
          <p className="mb-3 text-sm font-medium uppercase tracking-widest text-gray-400">
            Koleksi Terbaru
          </p>
          <h1 className="mb-6 text-4xl font-bold leading-tight sm:text-5xl">
            Temukan Gaya
            <br />
            <span className="text-white/70">yang Tepat Untukmu</span>
          </h1>
          <p className="mb-8 text-gray-400">
            Pilihan fashion berkualitas dengan harga terjangkau. Gratis ongkir
            untuk pembelian di atas Rp 300.000.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/products"
              className="rounded-full bg-white px-8 py-3 text-sm font-semibold text-gray-900 transition hover:bg-gray-100"
            >
              Belanja Sekarang
            </Link>
            <Link
              href="/categories"
              className="rounded-full border border-white/30 px-8 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Lihat Kategori
            </Link>
          </div>
        </div>
      </section>

      {/* ── Categories ── */}
      <section className="mx-auto w-full max-w-6xl px-4">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-gray-400">
              Jelajahi
            </p>
            <h2 className="text-2xl font-bold text-gray-900">Kategori</h2>
          </div>
          <Link
            href="/categories"
            className="text-sm font-medium text-gray-500 hover:text-gray-900"
          >
            Lihat semua →
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.slug}
              href={`/categories/${cat.slug}`}
              className="group relative flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-gray-50 transition hover:border-gray-200 hover:shadow-md"
            >
              {/* Category image */}
              <div className="relative aspect-square w-full overflow-hidden bg-gray-100">
                {cat.image_url ? (
                  <Image
                    src={cat.image_url}
                    alt={cat.name}
                    fill
                    sizes="(max-width: 640px) 50vw, 25vw"
                    className="object-cover transition group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-4xl">
                    {cat.emoji}
                  </div>
                )}
              </div>

              {/* Category name */}
              <div className="p-3 text-center">
                <span className="text-sm font-semibold text-gray-700 group-hover:text-gray-900">
                  {cat.name}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Featured Products ── */}
      <section className="mx-auto w-full max-w-6xl px-4">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-gray-400">
              Pilihan Kami
            </p>
            <h2 className="text-2xl font-bold text-gray-900">
              Produk Unggulan
            </h2>
          </div>
          <Link
            href="/products"
            className="text-sm font-medium text-gray-500 hover:text-gray-900"
          >
            Lihat semua →
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {FEATURED_PRODUCTS.map((product) => (
            <Link
              key={product.id}
              href={`/products/${product.slug}`}
              className="group flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white transition hover:shadow-md"
            >
              {/* Product image placeholder */}
              <div
                className={`aspect-square w-full ${product.image_placeholder} transition group-hover:opacity-90`}
              />

              <div className="flex flex-col gap-1 p-4">
                <p className="text-xs text-gray-400">{product.category}</p>
                <h3 className="text-sm font-semibold text-gray-800 group-hover:text-gray-900">
                  {product.name}
                </h3>
                <p className="mt-1 text-sm font-bold text-gray-900">
                  {formatRupiah(product.base_price)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Promo Banner ── */}
      <section className="mx-auto w-full max-w-6xl px-4">
        <div className="flex flex-col items-center justify-between gap-6 rounded-3xl bg-gray-900 px-8 py-10 text-white sm:flex-row sm:px-12">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-gray-400">
              Penawaran Spesial
            </p>
            <h2 className="text-2xl font-bold">Diskon hingga 50%</h2>
            <p className="mt-2 text-gray-400">
              Gunakan kode voucher saat checkout untuk mendapatkan diskon
              eksklusif.
            </p>
          </div>
          <Link
            href="/products"
            className="shrink-0 rounded-full bg-white px-8 py-3 text-sm font-semibold text-gray-900 transition hover:bg-gray-100"
          >
            Klaim Sekarang
          </Link>
        </div>
      </section>
    </div>
  );
}

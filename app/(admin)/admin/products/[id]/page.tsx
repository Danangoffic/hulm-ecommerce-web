// Route: /admin/products/[id]
export default async function AdminProductEditPage(
  props: PageProps<"/admin/products/[id]">
) {
  const { id } = await props.params;

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Edit Produk</h1>
      {/* TODO: Product form */}
      <p>Product ID: {id}</p>
    </div>
  );
}

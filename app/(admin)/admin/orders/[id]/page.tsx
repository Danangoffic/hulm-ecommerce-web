// Route: /admin/orders/[id]
export default async function AdminOrderDetailPage(
  props: PageProps<"/admin/orders/[id]">
) {
  const { id } = await props.params;

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Detail Pesanan</h1>
      {/* TODO: Order detail + update status */}
      <p>Order ID: {id}</p>
    </div>
  );
}

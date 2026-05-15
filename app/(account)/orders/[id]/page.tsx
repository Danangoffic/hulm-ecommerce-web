// Route: /orders/[id]
export default async function OrderDetailPage(
  props: PageProps<"/orders/[id]">
) {
  const { id } = await props.params;

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Detail Pesanan</h1>
      {/* TODO: Order detail, items, status, payment info */}
      <p>Order ID: {id}</p>
    </div>
  );
}

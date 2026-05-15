// Route: /products/[slug]
export default async function ProductDetailPage(
  props: PageProps<"/products/[slug]">
) {
  const { slug } = await props.params;

  return (
    <div>
      {/* TODO: Product images, info, variant selector, add to cart */}
      <p>Product: {slug}</p>
    </div>
  );
}

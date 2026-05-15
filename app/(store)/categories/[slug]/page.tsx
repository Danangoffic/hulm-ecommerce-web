// Route: /categories/[slug]
export default async function CategoryPage(
  props: PageProps<"/categories/[slug]">
) {
  const { slug } = await props.params;

  return (
    <div>
      {/* TODO: Category header + product grid */}
      <p>Category: {slug}</p>
    </div>
  );
}

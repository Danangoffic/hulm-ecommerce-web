export default function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* TODO: Navbar */}
      <main className="flex-1">{children}</main>
      {/* TODO: Footer */}
    </div>
  );
}

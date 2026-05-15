export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* TODO: Navbar */}
      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-8 px-4 py-8">
        {/* TODO: Account sidebar nav */}
        <aside className="w-56 shrink-0">{/* sidebar */}</aside>
        <main className="flex-1">{children}</main>
      </div>
      {/* TODO: Footer */}
    </div>
  );
}

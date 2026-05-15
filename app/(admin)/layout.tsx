export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* TODO: Admin sidebar */}
      <aside className="w-64 shrink-0 border-r bg-gray-900 text-white">
        {/* sidebar */}
      </aside>
      <div className="flex flex-1 flex-col">
        {/* TODO: Admin topbar */}
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}

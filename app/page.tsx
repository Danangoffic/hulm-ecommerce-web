import { redirect } from "next/navigation";

// Root "/" is handled by (store)/page.tsx — redirect just in case both resolve.
export default function RootPage() {
  redirect("/");
}

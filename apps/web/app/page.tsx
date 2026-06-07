import { redirect } from "next/navigation";

// No marketing index - the root goes straight to the admin portal. The proxy
// (proxy.ts) bounces unauthenticated requests on to /admin/login.
export default function Home() {
  redirect("/admin");
}

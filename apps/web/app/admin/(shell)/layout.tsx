import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api-client";
import { fetchMe } from "@/lib/api/galleries";
import { Sidebar } from "@/components/admin/sidebar";
import { Toaster } from "@/components/ui/toaster";

// The shell layout is dynamic — every admin request hits /api/auth/me so we
// have a real, validated identity for the topnav user menu. If the call 401s
// (cookie expired, missing, or invalid), bounce to login.
export const dynamic = "force-dynamic";

export default async function AdminShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await fetchMe();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect("/admin/login");
    }
    throw err;
  }

  return (
    <div className="min-h-dvh flex bg-bg">
      <Sidebar />
      <div className="flex-1 min-w-0">{children}</div>
      <Toaster />
    </div>
  );
}

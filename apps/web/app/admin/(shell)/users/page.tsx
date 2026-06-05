import { fetchMe } from "@/lib/api/galleries";
import { fetchAdmins } from "@/lib/api/admins";
import { AdminsManager } from "@/components/admin/admins-manager";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const [me, admins] = await Promise.all([fetchMe(), fetchAdmins()]);
  return (
    <div>
      <header className="p-4 border-b border-border">
        <h1 className="text-3xl font-extrabold tracking-wider text-ink-strong">
          Users
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Admins who can sign in. Each sees only their own galleries.
        </p>
      </header>

      <div className="p-4 pb-16 max-w-2xl">
        <AdminsManager me={me} initial={admins} />
      </div>
    </div>
  );
}

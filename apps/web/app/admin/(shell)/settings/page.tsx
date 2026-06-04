import { fetchMe } from "@/lib/api/galleries";
import { fetchAdmins } from "@/lib/api/admins";
import { SettingsForm } from "@/components/admin/settings-form";
import { AdminsManager } from "@/components/admin/admins-manager";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [me, admins] = await Promise.all([fetchMe(), fetchAdmins()]);
  return (
    <div>
      <header className="p-4 border-b border-border">
        <h1 className="text-3xl font-extrabold tracking-wider text-ink-strong">
          Settings
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Your public creator profile - shown on every client gallery landing.
        </p>
      </header>

      <div className="p-4 pb-16 max-w-2xl space-y-4">
        <SettingsForm initial={me} />
        <AdminsManager me={me} initial={admins} />
      </div>
    </div>
  );
}

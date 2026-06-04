import { fetchMe } from "@/lib/api/galleries";
import { SettingsForm } from "@/components/admin/settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const me = await fetchMe();
  return (
    <div>
      <header className="p-4 border-b border-border">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink-strong">
          Settings
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Your public creator profile — shown on every client gallery landing.
        </p>
      </header>

      <div className="p-4 pb-16">
        <SettingsForm initial={me} />
      </div>
    </div>
  );
}

import { fetchMe } from "@/lib/api/galleries";
import { SettingsForm } from "@/components/admin/settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const me = await fetchMe();
  return (
    <main className="p-8 max-w-xl">
      <header className="mb-8">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink-strong">
          Settings
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Your public creator profile — shown on every client gallery landing.
        </p>
      </header>
      <SettingsForm initial={me} />
    </main>
  );
}

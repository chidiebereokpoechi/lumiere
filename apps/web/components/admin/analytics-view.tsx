import type { GalleryAnalytics } from "@/lib/api/analytics";

interface Props {
  galleryId: string;
  analytics: GalleryAnalytics;
}

// Build a continuous day axis from `since` through today so the timeline shows
// empty days too (the API only returns days that had activity).
function dayAxis(since: number): string[] {
  const days: string[] = [];
  const start = new Date(since * 1000);
  const today = new Date();
  const cursor = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
  );
  const end = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  while (cursor.getTime() <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function whenDay(epoch: number): string {
  return new Date(epoch * 1000).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function AnalyticsView({ galleryId, analytics }: Props) {
  const {
    totals,
    viewsByDay,
    downloadsByDay,
    favoritesByFile,
    deviceSplit,
    since,
  } = analytics;
  const clients = analytics.clients ?? [];

  const days = dayAxis(since);
  const viewMap = new Map(viewsByDay.map((d) => [d.day, d.count]));
  const dlMap = new Map(downloadsByDay.map((d) => [d.day, d.count]));
  const maxDay = Math.max(
    1,
    ...days.map((d) => Math.max(viewMap.get(d) ?? 0, dlMap.get(d) ?? 0)),
  );

  const deviceTotal =
    deviceSplit.mobile +
    deviceSplit.tablet +
    deviceSplit.desktop +
    deviceSplit.unknown;
  const devices: { key: keyof typeof deviceSplit; label: string }[] = [
    { key: "desktop", label: "Desktop" },
    { key: "mobile", label: "Mobile" },
    { key: "tablet", label: "Tablet" },
    { key: "unknown", label: "Unknown" },
  ];

  const topFavorites = favoritesByFile.slice(0, 8);
  const maxFav = Math.max(1, ...topFavorites.map((f) => f.count));

  return (
    <div className="space-y-6">
      {/* Totals */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label="Views" value={totals.views} />
        <Stat label="Downloads" value={totals.downloads} />
        <Stat label="Favorites" value={totals.favorites} />
      </div>

      {/* Timeline */}
      <Card title="Last 30 days">
        <div className="flex items-center gap-4 mb-4 text-xs text-ink-muted">
          <Legend swatch="bg-accent" label="Views" />
          <Legend swatch="bg-surface-strong" label="Downloads" />
        </div>
        <div className="flex items-end gap-px h-40">
          {days.map((day) => {
            const v = viewMap.get(day) ?? 0;
            const d = dlMap.get(day) ?? 0;
            return (
              <div
                key={day}
                className="flex-1 flex items-end justify-center gap-px h-full"
                title={`${day} · ${v} views · ${d} downloads`}
              >
                <div
                  className="w-1/2 rounded-t-sm bg-accent"
                  style={{ height: `${(v / maxDay) * 100}%` }}
                />
                <div
                  className="w-1/2 rounded-t-sm bg-surface-strong"
                  style={{ height: `${(d / maxDay) * 100}%` }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-ink-subtle tabular-nums">
          <span>{days[0]}</span>
          <span>{days[days.length - 1]}</span>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Device split */}
        <Card title="Devices">
          {deviceTotal === 0 ? (
            <Empty>No views yet.</Empty>
          ) : (
            <div className="space-y-3">
              {devices.map(({ key, label }) => {
                const n = deviceSplit[key];
                const pct = Math.round((n / deviceTotal) * 100);
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-ink-strong">{label}</span>
                      <span className="tabular-nums text-ink-muted">
                        {pct}% · {n}
                      </span>
                    </div>
                    <div className="h-2 rounded-pill bg-surface-sunken overflow-hidden">
                      <div
                        className="h-full bg-accent"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Top favorites */}
        <Card title="Most favorited">
          {topFavorites.length === 0 ? (
            <Empty>No favorites yet.</Empty>
          ) : (
            <ul className="space-y-3">
              {topFavorites.map((f) => (
                <li key={f.fileId} className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/img/${galleryId}/${f.fileId}/thumb`}
                    alt=""
                    className="h-10 w-10 rounded-md object-cover bg-surface-sunken shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="h-2 rounded-pill bg-surface-sunken overflow-hidden">
                      <div
                        className="h-full bg-accent"
                        style={{ width: `${(f.count / maxFav) * 100}%` }}
                      />
                    </div>
                  </div>
                  <span className="tabular-nums text-sm text-ink-muted shrink-0">
                    {f.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Client activity — who did what (clients identify by email to fav/list) */}
      <Card title="Client activity">
        {clients.length === 0 ? (
          <Empty>No identified client activity yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-extrabold tracking-wider text-ink-subtle border-b border-border">
                  <th className="py-2 pr-4 font-extrabold">Client</th>
                  <th className="py-2 px-4 font-extrabold tabular-nums">
                    Favorites
                  </th>
                  <th className="py-2 px-4 font-extrabold tabular-nums">
                    Lists
                  </th>
                  <th className="py-2 px-4 font-extrabold tabular-nums">
                    Downloads
                  </th>
                  <th className="py-2 pl-4 font-extrabold">Last active</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr
                    key={c.email}
                    className="border-b border-border last:border-0"
                  >
                    <td className="py-2.5 pr-4 text-ink-strong font-semibold break-all">
                      {c.email}
                    </td>
                    <td className="py-2.5 px-4 tabular-nums text-ink-muted">
                      {c.favorites}
                    </td>
                    <td className="py-2.5 px-4 tabular-nums text-ink-muted">
                      {c.lists}
                    </td>
                    <td className="py-2.5 px-4 tabular-nums text-ink-muted">
                      {c.downloads}
                    </td>
                    <td className="py-2.5 pl-4 text-ink-muted tabular-nums">
                      {whenDay(c.lastAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-surface border border-border p-4">
      <p className="text-xs font-extrabold tracking-wider text-ink-muted">
        {label}
      </p>
      <p className="mt-2 text-3xl font-bold tabular-nums text-ink-strong">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl bg-surface border border-border p-6">
      <h2 className="text-xs font-extrabold tracking-wider text-ink-muted mb-4">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 rounded-sm ${swatch}`} />
      {label}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-ink-muted">{children}</p>;
}

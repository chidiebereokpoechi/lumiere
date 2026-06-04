import { apiServer, ApiError } from "@/lib/api-client";
import type { HealthResponse } from "@lumiere/types";

export const dynamic = "force-dynamic";

async function fetchHealth(): Promise<HealthResponse | { error: string }> {
  try {
    return await apiServer<HealthResponse>("/health");
  } catch (err) {
    if (err instanceof ApiError) return { error: `api ${err.status}` };
    return { error: "unreachable" };
  }
}

export default async function HomePage() {
  const health = await fetchHealth();
  const isOk = "status" in health && health.status === "ok";
  const isDegraded = "status" in health && health.status === "degraded";
  const isError = "error" in health;

  return (
    <main className="mx-auto max-w-3xl px-8 py-24 md:py-32">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium tracking-wider text-ink-muted">
            Lumière
          </p>
          <h1 className="mt-3 text-5xl md:text-6xl font-semibold tracking-wider text-ink">
            Self-hosted gallery delivery.
          </h1>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-muted">
            Frontend scaffold. Satoshi loaded, design tokens wired - built on
            top of a Bun + Elysia backend talking to RustFS over the LAN.
          </p>
        </div>
      </header>

      <section className="mt-16">
        <h2 className="text-xs font-medium tracking-wider text-ink-muted">
          System status
        </h2>
        <div className="mt-4 rounded-md bg-surface p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <StatusDot kind={isOk ? "ok" : isDegraded ? "warn" : "error"} />
              <div>
                <p className="text-lg font-medium text-ink">
                  {isOk
                    ? "All systems nominal"
                    : isDegraded
                      ? "Degraded"
                      : "Cannot reach API"}
                </p>
                <p className="mt-1 text-sm text-ink-muted">
                  {isError
                    ? (health as { error: string }).error
                    : `db: ${(health as HealthResponse).db} · s3: ${(health as HealthResponse).s3}`}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-hover transition-colors duration-150 active:scale-95"
            >
              Continue
            </button>
          </div>
        </div>
      </section>

      <section className="mt-16 grid gap-4 md:grid-cols-3">
        <SwatchCard label="bg" varName="--bg" />
        <SwatchCard label="surface" varName="--surface" />
        <SwatchCard label="accent" varName="--accent" />
      </section>

      <section className="mt-16 space-y-4">
        <h2 className="text-xs font-medium tracking-wider text-ink-muted">
          Type ramp
        </h2>
        <div className="space-y-3">
          <p className="text-4xl font-semibold tracking-wider">Display, 600</p>
          <p className="text-2xl font-medium">Heading, 500</p>
          <p className="text-base text-ink">
            Body - the quick brown fox jumps over the lazy dog 0123456789
          </p>
          <p className="text-sm text-ink-muted">
            Muted - supporting text and metadata.
          </p>
          <p className="text-xs tracking-wider text-ink-muted">
            Eyebrow · all caps
          </p>
        </div>
      </section>
    </main>
  );
}

function StatusDot({ kind }: { kind: "ok" | "warn" | "error" }) {
  const cls =
    kind === "ok"
      ? "bg-positive"
      : kind === "warn"
        ? "bg-accent"
        : "bg-negative";
  return (
    <span
      aria-hidden
      className={`relative inline-block h-2.5 w-2.5 rounded-pill ${cls}`}
    >
      <span
        className={`absolute inset-0 -m-1 rounded-pill ${cls} opacity-30 animate-ping`}
      />
    </span>
  );
}

function SwatchCard({ label, varName }: { label: string; varName: string }) {
  return (
    <div className="rounded-md bg-surface p-4">
      <div
        className="h-20 w-full rounded-md"
        style={{ background: `var(${varName})` }}
      />
      <div className="mt-4 flex items-baseline justify-between">
        <span className="text-sm font-medium text-ink">{label}</span>
        <span className="font-mono text-xs text-ink-muted">{varName}</span>
      </div>
    </div>
  );
}

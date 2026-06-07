import Link from "next/link";
import {
  fetchGalleries,
  fetchMe,
  type GallerySummary,
} from "@/lib/api/galleries";
import { Topnav } from "@/components/admin/topnav";
import { ImageIcon, Plus } from "@/components/ui/icons";
import { buttonClasses } from "@/components/ui/button-variants";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminGalleriesPage() {
  const [me, galleries] = await Promise.all([fetchMe(), fetchGalleries()]);

  return (
    <div className="">
      <Topnav
        title="Galleries"
        subtitle={
          galleries.length === 0
            ? "Start delivering your work to clients."
            : `${galleries.length} ${galleries.length === 1 ? "gallery" : "galleries"}`
        }
        user={{ name: me.name, email: me.email }}
        action={<NewGalleryButton />}
      />

      <div className="px-4 py-4">
        {galleries.length === 0 ? (
          <EmptyState />
        ) : (
          <GalleryGrid galleries={galleries} />
        )}
      </div>
    </div>
  );
}

function GalleryGrid({ galleries }: { galleries: GallerySummary[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {galleries.map((g) => (
        <GalleryCard key={g.id} gallery={g} />
      ))}
    </div>
  );
}

function GalleryCard({ gallery }: { gallery: GallerySummary }) {
  const status = gallery.status ?? "active";
  return (
    <Link
      href={`/admin/galleries/${gallery.id}`}
      className="group flex flex-col gap-4 rounded-xl bg-surface border border-border p-2 sm:p-4 hover:bg-surface-2 hover:border-border-strong transition-colors duration-150"
    >
      <div className="aspect-3/2 w-full overflow-hidden rounded-md bg-surface-sunken relative">
        {gallery.coverFileId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/img/${gallery.id}/${gallery.coverFileId}/thumb`}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <PlaceholderCover />
        )}
        <StatusPill status={status} />
      </div>

      <div className="">
        <h2 className="text-base font-bold text-ink-strong truncate">
          {gallery.title}
        </h2>
        <div className="mt-2 flex items-center gap-2 text-xs text-ink-muted">
          <span>
            {gallery.photoCount} {gallery.photoCount === 1 ? "photo" : "photos"}
          </span>
          <Dot />
          <span>
            {gallery.viewCount ?? 0}{" "}
            {gallery.viewCount === 1 ? "view" : "views"}
          </span>
          <Dot />
          <span title={absoluteDate(gallery.updatedAt)}>
            {relativeDate(gallery.updatedAt)}
          </span>
        </div>
      </div>
    </Link>
  );
}

function StatusPill({ status }: { status: "active" | "archived" | "draft" }) {
  const cls =
    status === "active"
      ? "bg-surface text-ink-strong border-border"
      : status === "draft"
        ? "bg-accent-soft text-ink-strong border-accent/40"
        : "bg-surface-sunken text-ink-muted border-border";
  return (
    <span
      className={`absolute top-4 left-4 rounded-md border px-2 py-1 text-xs font-extrabold tracking-wider ${cls}`}
    >
      {status}
    </span>
  );
}

function Dot() {
  return (
    <span aria-hidden className="text-ink-muted">
      ·
    </span>
  );
}

function PlaceholderCover() {
  return (
    <div className="h-full w-full bg-surface-sunken flex items-center justify-center">
      <ImageIcon size={24} className="text-ink-muted" />
    </div>
  );
}

function NewGalleryButton() {
  return (
    <Link
      href="/admin/galleries/new"
      className={buttonClasses("primary", "tracking-wider")}
    >
      <Plus size={16} />
      New gallery
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="max-w-2xl rounded-xl bg-surface border border-border p-4">
      <p className="text-xs font-bold tracking-wider text-ink-muted">
        Nothing here yet
      </p>
      <h2 className="mt-4 text-2xl font-extrabold tracking-wider text-ink-strong">
        Create your first gallery
      </h2>
      <p className="mt-2 text-sm text-ink-muted leading-relaxed">
        Galleries hold photos, video, audio and files, delivered to your clients
        via a password-protected link.
      </p>
      <div className="mt-4 flex">
        <NewGalleryButton />
      </div>
    </div>
  );
}

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
function relativeDate(epochSeconds: number): string {
  const diff = epochSeconds * 1000 - Date.now();
  const abs = Math.abs(diff);
  if (abs < 60_000) return RELATIVE.format(Math.round(diff / 1000), "second");
  if (abs < 3600_000)
    return RELATIVE.format(Math.round(diff / 60_000), "minute");
  if (abs < 86_400_000)
    return RELATIVE.format(Math.round(diff / 3600_000), "hour");
  if (abs < 7 * 86_400_000)
    return RELATIVE.format(Math.round(diff / 86_400_000), "day");
  return absoluteDate(epochSeconds);
}
function absoluteDate(epochSeconds: number): string {
  return formatDate(epochSeconds);
}

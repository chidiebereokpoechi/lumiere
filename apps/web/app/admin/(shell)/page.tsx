import Link from 'next/link';
import { fetchGalleries, fetchMe, type GallerySummary } from '@/lib/api/galleries';
import { Topnav } from '@/components/admin/topnav';

export const dynamic = 'force-dynamic';

export default async function AdminGalleriesPage() {
  const [me, galleries] = await Promise.all([fetchMe(), fetchGalleries()]);

  return (
    <div>
      <Topnav
        title="Galleries"
        subtitle={
          galleries.length === 0
            ? 'Start delivering photos to your clients.'
            : `${galleries.length} gallery${galleries.length === 1 ? '' : 'ies'}`
        }
        user={{ name: me.name, email: me.email }}
        action={<NewGalleryButton />}
      />

      <div className="px-10 pb-16">
        {galleries.length === 0 ? <EmptyState /> : <GalleryGrid galleries={galleries} />}
      </div>
    </div>
  );
}

function GalleryGrid({ galleries }: { galleries: GallerySummary[] }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {galleries.map((g) => (
        <GalleryCard key={g.id} gallery={g} />
      ))}
    </div>
  );
}

function GalleryCard({ gallery }: { gallery: GallerySummary }) {
  const status = gallery.status ?? 'active';
  return (
    <Link
      href={`/admin/galleries/${gallery.id}`}
      className="group flex flex-col rounded-lg bg-surface p-3 hover:bg-surface-2 hover:-translate-y-0.5 transition-[transform,background-color] duration-200"
    >
      <div className="aspect-[16/10] w-full overflow-hidden rounded-md bg-surface-sunken relative">
        {gallery.coverPhotoId ? (
          // The /img route is admin-gated; this works in-browser because the
          // photographer's JWT cookie is sent same-origin via the Next rewrite.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/img/${gallery.id}/${gallery.coverPhotoId}/thumb`}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <PlaceholderCover />
        )}
        <StatusPill status={status} />
      </div>

      <div className="px-2 pt-5 pb-3">
        <h2 className="text-base font-semibold text-ink truncate">{gallery.title}</h2>
        <div className="mt-2 flex items-center gap-2 text-xs text-ink-muted">
          <span>{gallery.photoCount} photo{gallery.photoCount === 1 ? '' : 's'}</span>
          <Dot />
          <span>{gallery.viewCount ?? 0} view{gallery.viewCount === 1 ? '' : 's'}</span>
          <Dot />
          <span title={absoluteDate(gallery.updatedAt)}>{relativeDate(gallery.updatedAt)}</span>
        </div>
      </div>
    </Link>
  );
}

function StatusPill({ status }: { status: 'active' | 'archived' | 'draft' }) {
  const cls =
    status === 'active'
      ? 'bg-surface-2 text-ink'
      : status === 'draft'
        ? 'bg-accent-soft text-ink'
        : 'bg-surface text-ink-muted';
  return (
    <span
      className={`absolute top-3 left-3 rounded-pill px-2.5 py-1 text-[10px] font-medium uppercase tracking-widest ${cls} backdrop-blur-sm`}
    >
      {status}
    </span>
  );
}

function Dot() {
  return <span aria-hidden className="text-ink-subtle">·</span>;
}

function PlaceholderCover() {
  return (
    <div className="h-full w-full bg-gradient-to-br from-surface-sunken to-surface flex items-center justify-center">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-ink-subtle">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="9" cy="11" r="1.5" />
        <path d="m21 17-5-5L8 19" />
      </svg>
    </div>
  );
}

function NewGalleryButton() {
  // TODO: wire to /admin/galleries/new once the create form lands.
  return (
    <button
      type="button"
      disabled
      className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink hover:bg-accent-hover transition-colors active:scale-[0.99] disabled:opacity-50"
      title="Coming next pass"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
      New gallery
    </button>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto max-w-xl rounded-lg bg-surface p-12 text-center mt-10">
      <p className="text-xs font-semibold tracking-[0.22em] uppercase text-ink-muted">
        Nothing here yet
      </p>
      <h2 className="mt-4 text-2xl font-semibold tracking-tight text-ink">
        Create your first gallery
      </h2>
      <p className="mt-3 text-sm text-ink-muted">
        Galleries hold photos and attachments and ship to your clients via a
        password-protected link.
      </p>
      <div className="mt-8">
        <NewGalleryButton />
      </div>
    </div>
  );
}

const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
function relativeDate(epochSeconds: number): string {
  const diff = epochSeconds * 1000 - Date.now();
  const abs = Math.abs(diff);
  if (abs < 60_000) return RELATIVE.format(Math.round(diff / 1000), 'second');
  if (abs < 3600_000) return RELATIVE.format(Math.round(diff / 60_000), 'minute');
  if (abs < 86_400_000) return RELATIVE.format(Math.round(diff / 3600_000), 'hour');
  if (abs < 7 * 86_400_000) return RELATIVE.format(Math.round(diff / 86_400_000), 'day');
  return absoluteDate(epochSeconds);
}
function absoluteDate(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleDateString('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

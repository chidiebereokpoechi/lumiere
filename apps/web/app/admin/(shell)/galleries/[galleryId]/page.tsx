import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fetchGallery, fetchMe } from '@/lib/api/galleries';
import { ApiError } from '@/lib/api-client';
import { Topnav } from '@/components/admin/topnav';
import { SettingsForm } from './settings-form';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ galleryId: string }>;
}

export default async function GalleryEditorPage({ params }: Props) {
  const { galleryId } = await params;

  let gallery;
  try {
    [gallery] = await Promise.all([fetchGallery(galleryId)]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const me = await fetchMe();

  return (
    <div>
      <Topnav
        title={gallery.title}
        subtitle={`/g/${gallery.slug}${gallery.passwordHash ? ' · password-protected' : ' · public'}`}
        user={{ name: me.name, email: me.email }}
        action={
          <Link
            href={`/g/${gallery.slug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md bg-surface border-2 border-border px-3 py-2 text-xs font-bold text-ink-strong hover:bg-surface-2 hover:border-border-strong transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            Client view
          </Link>
        }
      />

      <div className="px-8 py-6 pb-24">
        <nav className="flex items-center gap-2 mb-6">
          <Tab href={`/admin/galleries/${galleryId}`} active>Settings</Tab>
          <Tab href={`/admin/galleries/${galleryId}/photos`} disabled>Photos</Tab>
          <Tab href={`/admin/galleries/${galleryId}/analytics`} disabled>Analytics</Tab>
        </nav>

        <div className="mx-auto max-w-3xl">
          <SettingsForm gallery={gallery} />
        </div>
      </div>
    </div>
  );
}

function Tab({ href, active, disabled, children }: { href: string; active?: boolean; disabled?: boolean; children: React.ReactNode }) {
  const base = 'inline-flex items-center gap-1 rounded-md border-2 px-3 py-1.5 text-xs font-bold transition-colors';
  if (disabled) {
    return (
      <span className={`${base} bg-surface-2 text-ink-subtle border-border cursor-not-allowed`}>
        {children}
        <span className="ml-1 text-[0.55rem] uppercase tracking-widest text-ink-subtle">soon</span>
      </span>
    );
  }
  return (
    <Link
      href={href}
      className={`${base} ${
        active
          ? 'bg-surface-strong text-ink-inverse border-surface-strong'
          : 'bg-surface text-ink-muted border-border hover:bg-surface-2 hover:text-ink-strong hover:border-border-strong'
      }`}
    >
      {children}
    </Link>
  );
}

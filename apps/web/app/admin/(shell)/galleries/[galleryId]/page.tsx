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
            className="inline-flex items-center gap-2 rounded-md bg-surface px-4 py-2.5 text-sm font-medium text-ink hover:bg-surface-2 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            Open client view
          </Link>
        }
      />

      <div className="px-10 pb-24">
        <nav className="flex items-center gap-2 mb-6">
          <Tab href={`/admin/galleries/${galleryId}`} active>Settings</Tab>
          <Tab href={`/admin/galleries/${galleryId}/photos`} disabled>Photos · {' '}<span className="text-ink-subtle">soon</span></Tab>
          <Tab href={`/admin/galleries/${galleryId}/analytics`} disabled>Analytics · {' '}<span className="text-ink-subtle">soon</span></Tab>
        </nav>

        <div className="mx-auto max-w-3xl">
          <SettingsForm gallery={gallery} />
        </div>
      </div>
    </div>
  );
}

function Tab({ href, active, disabled, children }: { href: string; active?: boolean; disabled?: boolean; children: React.ReactNode }) {
  if (disabled) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-ink-subtle cursor-not-allowed">
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        active ? 'bg-surface text-ink' : 'text-ink-muted hover:bg-surface hover:text-ink'
      }`}
    >
      {children}
    </Link>
  );
}

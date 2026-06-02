import Link from 'next/link';
import { Topnav } from '@/components/admin/topnav';

type TabKey = 'settings' | 'photos' | 'comments' | 'analytics';

interface Props {
  galleryId: string;
  title: string;
  slug: string;
  passwordProtected: boolean;
  user: { name: string; email: string };
  active: TabKey;
}

// Shared chrome for the gallery editor: the Topnav plus the Settings/Photos/
// Analytics tab row. Each editor sub-page renders this with its own `active`.
export function GalleryHeader({ galleryId, title, slug, passwordProtected, user, active }: Props) {
  return (
    <>
      <Topnav
        title={title}
        subtitle={`/g/${slug}${passwordProtected ? ' · password-protected' : ' · public'}`}
        user={user}
        action={
          <Link
            href={`/g/${slug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-md bg-surface border border-border px-4 py-2.5 text-sm font-bold uppercase tracking-wider font-[family-name:'Ika_Compact'] text-ink-strong hover:bg-surface-2 hover:border-border-strong transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            Client view
          </Link>
        }
      />

      <nav className="flex items-center gap-2 px-8 pt-6">
        <Tab href={`/admin/galleries/${galleryId}`} active={active === 'settings'}>Settings</Tab>
        <Tab href={`/admin/galleries/${galleryId}/photos`} active={active === 'photos'}>Photos</Tab>
        <Tab href={`/admin/galleries/${galleryId}/comments`} active={active === 'comments'}>Comments</Tab>
        <Tab href={`/admin/galleries/${galleryId}/analytics`} active={active === 'analytics'}>Analytics</Tab>
      </nav>
    </>
  );
}

function Tab({ href, active, disabled, children }: { href: string; active?: boolean; disabled?: boolean; children: React.ReactNode }) {
  const base = "inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-bold uppercase tracking-wider font-[family-name:'Ika_Compact'] transition-colors";
  if (disabled) {
    return (
      <span className={`${base} bg-surface-2 text-ink-subtle border-border cursor-not-allowed`}>
        {children}
        <span className="ml-1 text-xs uppercase tracking-widest text-ink-subtle">soon</span>
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

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
}

const NAV: NavItem[] = [
  { href: '/admin', label: 'Galleries', icon: <IconGrid /> },
  { href: '/admin/analytics', label: 'Analytics', icon: <IconChart />, disabled: true },
  { href: '/admin/watermarks', label: 'Watermarks', icon: <IconStamp />, disabled: true },
  { href: '/admin/settings', label: 'Settings', icon: <IconGear />, disabled: true },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden md:flex md:w-64 flex-col bg-surface px-5 py-8">
      <div className="px-3">
        <p className="text-xs font-semibold tracking-[0.22em] uppercase text-ink-muted">
          Lumière
        </p>
      </div>

      <nav className="mt-10 flex-1 space-y-1">
        {NAV.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== '/admin' && pathname.startsWith(item.href));
          if (item.disabled) {
            return (
              <span
                key={item.href}
                aria-disabled
                className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-ink-subtle cursor-not-allowed"
              >
                <span className="opacity-60">{item.icon}</span>
                {item.label}
                <span className="ml-auto text-[10px] uppercase tracking-widest text-ink-subtle/70">
                  soon
                </span>
              </span>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ' +
                (active
                  ? 'bg-accent-soft text-ink'
                  : 'text-ink-muted hover:bg-surface-2 hover:text-ink')
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

function IconGrid() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}
function IconChart() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 20h18M6 16V9M11 16V5M16 16v-7M21 16v-4" />
    </svg>
  );
}
function IconStamp() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 21h14M7 16v-3a4 4 0 0 1 4-4 2 2 0 0 0 2-2V5a2 2 0 1 1 4 0v2a2 2 0 0 0 2 2 4 4 0 0 1-2 7v0H7z" />
    </svg>
  );
}
function IconGear() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c0 .66.39 1.26 1 1.51H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

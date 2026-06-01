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
    <aside className="hidden md:flex md:w-44 flex-col bg-surface-2 border-r-2 border-border px-3 py-6">
      <div className="px-2 pb-4">
        <p className="text-[0.5rem] font-bold tracking-[0.28em] uppercase text-ink-muted">
          Lumière
        </p>
      </div>

      <nav className="flex-1 space-y-2">
        {NAV.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== '/admin' && pathname.startsWith(item.href));
          return (
            <NavLink key={item.href} item={item} active={active} />
          );
        })}
      </nav>
    </aside>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const base =
    'flex items-center gap-2 px-3 py-2 rounded-md text-xs font-bold transition-colors';

  if (item.disabled) {
    return (
      <span
        aria-disabled
        className={`${base} bg-surface-2 text-ink-subtle border-2 border-border cursor-not-allowed`}
      >
        <span className="opacity-50">{item.icon}</span>
        {item.label}
      </span>
    );
  }

  if (active) {
    return (
      <Link
        href={item.href}
        className={`${base} bg-surface-strong text-ink-inverse border-2 border-surface-strong`}
        style={{ boxShadow: 'var(--ring-accent)' }}
      >
        {item.icon}
        {item.label}
      </Link>
    );
  }

  return (
    <Link
      href={item.href}
      className={`${base} bg-surface text-ink-muted border-2 border-border hover:bg-surface-sunken hover:text-ink-strong`}
    >
      {item.icon}
      {item.label}
    </Link>
  );
}

function IconGrid() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}
function IconChart() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 20h18M6 16V9M11 16V5M16 16v-7M21 16v-4" />
    </svg>
  );
}
function IconStamp() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 21h14M7 16v-3a4 4 0 0 1 4-4 2 2 0 0 0 2-2V5a2 2 0 1 1 4 0v2a2 2 0 0 0 2 2 4 4 0 0 1-2 7v0H7z" />
    </svg>
  );
}
function IconGear() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c0 .66.39 1.26 1 1.51H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

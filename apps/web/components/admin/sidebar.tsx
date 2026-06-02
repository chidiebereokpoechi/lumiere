'use client';

import { useEffect, useState } from 'react';
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

const STORAGE_KEY = 'lumiere_sidebar_collapsed';

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // Restore the persisted collapse state after mount (avoids SSR mismatch).
  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === '1') setCollapsed(true);
  }, []);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  }

  return (
    <aside
      className={`hidden md:flex md:flex-col shrink-0 sticky top-0 h-dvh overflow-y-auto bg-surface-2 border-r border-border py-4 transition-[width] duration-200 ease-out ${
        collapsed ? 'md:w-16 px-2' : 'md:w-56 px-3'
      }`}
    >
      <div className={`flex items-center pb-4 ${collapsed ? 'justify-center' : 'justify-between px-2'}`}>
        {!collapsed && (
          <p className="text-xs font-bold tracking-[0.28em] uppercase text-ink-muted">Lumière</p>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand' : 'Collapse'}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-sunken hover:text-ink-strong transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`}>
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </div>

      <nav className="flex-1 space-y-2">
        {NAV.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== '/admin' && pathname.startsWith(item.href));
          return <NavLink key={item.href} item={item} active={active} collapsed={collapsed} />;
        })}
      </nav>
    </aside>
  );
}

function NavLink({ item, active, collapsed }: { item: NavItem; active: boolean; collapsed: boolean }) {
  const base =
    `flex items-center rounded-md text-sm font-semibold uppercase tracking-wider font-[family-name:'Ika_Compact'] transition-colors ${
      collapsed ? 'justify-center h-10 w-10 mx-auto' : 'gap-2.5 px-3 py-2.5'
    }`;
  const label = item.label;

  if (item.disabled) {
    return (
      <span
        aria-disabled
        title={collapsed ? label : undefined}
        className={`${base} bg-surface-2 text-ink-subtle border border-border cursor-not-allowed`}
      >
        <span className="opacity-50">{item.icon}</span>
        {!collapsed && label}
      </span>
    );
  }

  const tone = active
    ? 'bg-surface-strong text-ink-inverse border border-surface-strong'
    : 'bg-surface text-ink-muted border border-border hover:bg-surface-sunken hover:text-ink-strong';

  return (
    <Link
      href={item.href}
      title={collapsed ? label : undefined}
      className={`${base} ${tone}`}
      style={active ? { boxShadow: 'var(--ring-accent)' } : undefined}
    >
      {item.icon}
      {!collapsed && label}
    </Link>
  );
}

function IconGrid() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}
function IconChart() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 20h18M6 16V9M11 16V5M16 16v-7M21 16v-4" />
    </svg>
  );
}
function IconStamp() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 21h14M7 16v-3a4 4 0 0 1 4-4 2 2 0 0 0 2-2V5a2 2 0 1 1 4 0v2a2 2 0 0 0 2 2 4 4 0 0 1-2 7v0H7z" />
    </svg>
  );
}
function IconGear() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c0 .66.39 1.26 1 1.51H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

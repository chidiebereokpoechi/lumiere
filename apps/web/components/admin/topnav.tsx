'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiClientMutation } from '@/lib/api-client';
import { ThemeToggle } from '@/components/theme-toggle';

interface TopnavProps {
  title: string;
  subtitle?: string;
  user: { name: string; email: string };
  action?: React.ReactNode;
}

export function Topnav({ title, subtitle, user, action }: TopnavProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await apiClientMutation('/api/auth/logout', { method: 'POST' });
    } catch {
      /* even if logout fails on the server, clear UI state */
    }
    router.push('/admin/login');
    router.refresh();
  }

  return (
    <header className="flex items-center justify-between px-8 py-5 bg-bg border-b-2 border-border">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink-strong">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-xs text-ink-muted">{subtitle}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        {action}
        <ThemeToggle />
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex items-center gap-2 rounded-md bg-surface border-2 border-border px-2 py-1.5 text-xs font-bold text-ink-strong hover:bg-surface-2 transition-colors"
          >
            <Avatar name={user.name || user.email} />
            <span className="hidden sm:inline">{user.name || user.email.split('@')[0]}</span>
          </button>
          {menuOpen && (
            <>
              <button
                type="button"
                aria-hidden
                tabIndex={-1}
                onClick={() => setMenuOpen(false)}
                className="fixed inset-0 z-10 cursor-default"
              />
              <div
                role="menu"
                className="absolute right-0 z-20 mt-2 w-56 rounded-md bg-surface border-2 border-border p-2"
              >
                <div className="px-3 py-2">
                  <p className="text-xs font-bold text-ink-strong truncate">{user.name}</p>
                  <p className="text-[0.65rem] text-ink-muted truncate">{user.email}</p>
                </div>
                <div className="my-1 mx-1 h-[2px] bg-border" />
                <button
                  type="button"
                  onClick={signOut}
                  disabled={signingOut}
                  className="w-full rounded-md px-3 py-2 text-left text-xs font-bold text-ink-strong hover:bg-surface-2 disabled:opacity-50"
                >
                  {signingOut ? 'Signing out…' : 'Sign out'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function Avatar({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-accent text-accent-ink text-xs font-extrabold">
      {initial}
    </span>
  );
}

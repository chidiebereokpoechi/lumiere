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
    <header className="flex items-center justify-between px-10 py-6 bg-bg">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        {action}
        <ThemeToggle />
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex items-center gap-3 rounded-pill bg-surface px-3 py-2 text-sm text-ink hover:bg-surface-2 transition-colors"
          >
            <Avatar name={user.name || user.email} />
            <span className="hidden sm:inline font-medium">{user.name || user.email.split('@')[0]}</span>
          </button>
          {menuOpen && (
            <>
              {/* click-outside scrim */}
              <button
                type="button"
                aria-hidden
                tabIndex={-1}
                onClick={() => setMenuOpen(false)}
                className="fixed inset-0 z-10 cursor-default"
              />
              <div
                role="menu"
                className="absolute right-0 z-20 mt-2 w-56 rounded-lg bg-surface-2 p-2 shadow-lg"
              >
                <div className="px-3 py-2.5">
                  <p className="text-sm font-medium text-ink truncate">{user.name}</p>
                  <p className="text-xs text-ink-muted truncate">{user.email}</p>
                </div>
                <button
                  type="button"
                  onClick={signOut}
                  disabled={signingOut}
                  className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-ink hover:bg-surface disabled:opacity-50"
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
    <span className="inline-flex h-8 w-8 items-center justify-center rounded-pill bg-accent text-accent-ink text-sm font-semibold">
      {initial}
    </span>
  );
}

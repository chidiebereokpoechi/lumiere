"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiClientMutation } from "@/lib/api-client";

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
      await apiClientMutation("/api/auth/logout", { method: "POST" });
    } catch {
      /* even if logout fails on the server, clear UI state */
    }
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between p-4 bg-bg border-b border-border">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink-strong">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1.5 text-sm text-ink-muted">{subtitle}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        {action}
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex items-center gap-2.5 rounded-md bg-surface border border-border px-4 py-2.5 text-sm font-semibold text-ink-strong hover:bg-surface-2 transition-colors"
          >
            <span className="hidden sm:inline">
              {user.name || user.email.split("@")[0]}
            </span>
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
                className="absolute right-0 z-20 mt-2 w-56 rounded-md bg-surface border border-border p-2"
              >
                <div className="px-3 py-2.5">
                  <p className="text-sm font-semibold text-ink-strong truncate">
                    {user.name}
                  </p>
                  <p className="text-xs text-ink-muted truncate mt-0.5">
                    {user.email}
                  </p>
                </div>
                <div className="my-1 mx-1 h-px bg-border" />
                <button
                  type="button"
                  onClick={signOut}
                  disabled={signingOut}
                  className="w-full rounded-md px-3 py-2 text-left text-sm font-semibold text-ink-strong hover:bg-surface-2 disabled:opacity-50"
                >
                  {signingOut ? "Signing out…" : "Sign out"}
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
    <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-accent text-white text-sm font-extrabold">
      {initial}
    </span>
  );
}

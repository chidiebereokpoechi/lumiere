"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiClientMutation } from "@/lib/api-client";
import { ListIcon } from "@/components/ui/icons";
import { openMobileNav } from "@/components/admin/sidebar";

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
    <header className="sticky top-0 z-30 flex flex-wrap items-start justify-between gap-3 p-4 bg-bg border-b border-border">
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <button
          type="button"
          onClick={openMobileNav}
          aria-label="Open menu"
          className="md:hidden inline-flex shrink-0 items-center justify-center rounded-md bg-surface border border-border p-2.5 text-ink-strong hover:bg-surface-2 transition-colors"
        >
          <ListIcon size={20} />
        </button>
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-wider text-ink-strong truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1.5 text-sm text-ink-muted truncate">{subtitle}</p>
          )}
        </div>
      </div>

      <div className="flex items-start flex-wrap justify-end gap-3 basis-full sm:basis-auto">
        {action}
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex items-center gap-2.5 rounded-md bg-surface border border-border px-4 py-2.5 text-sm font-semibold text-ink-strong hover:bg-surface-2 transition-colors"
          >
            <Avatar name={user.name || user.email} />
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
    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-accent text-white text-xs font-extrabold">
      {initial}
    </span>
  );
}

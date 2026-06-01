'use client';

import { useEffect, useState } from 'react';
import { isTheme, THEME_STORAGE_KEY, type Theme } from '@/lib/theme';

/**
 * Three-state cycle: system → light → dark → system.
 * Visually a single icon button with a soft surface — no border.
 *
 * The "system" state is the default and means "follow the OS". We do this by
 * removing the data-theme attribute so the media query in globals.css wins.
 */
export function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>('system');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (isTheme(stored)) setThemeState(stored);
    setMounted(true);
  }, []);

  function setTheme(next: Theme) {
    setThemeState(next);
    if (next === 'system') {
      localStorage.removeItem(THEME_STORAGE_KEY);
      document.documentElement.removeAttribute('data-theme');
    } else {
      localStorage.setItem(THEME_STORAGE_KEY, next);
      document.documentElement.setAttribute('data-theme', next);
    }
  }

  function cycle() {
    setTheme(theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system');
  }

  // Avoid hydration mismatch: render a placeholder icon until mounted.
  const label =
    theme === 'system' ? 'Theme: system' : theme === 'light' ? 'Theme: light' : 'Theme: dark';

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={cycle}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-surface border-2 border-border text-ink-strong hover:bg-surface-2 active:scale-95 transition-[transform,background-color] duration-150"
    >
      {mounted ? <ThemeIcon theme={theme} /> : <ThemeIcon theme="system" />}
    </button>
  );
}

function ThemeIcon({ theme }: { theme: Theme }) {
  if (theme === 'light') {
    // Sun
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    );
  }
  if (theme === 'dark') {
    // Moon
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
      </svg>
    );
  }
  // System (laptop)
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M2 20h20" />
    </svg>
  );
}

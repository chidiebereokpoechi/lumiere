/**
 * Theme model:
 *   - 'system' (default) follows the OS via prefers-color-scheme media query.
 *     We don't write any data-theme attribute in this mode — CSS handles it.
 *   - 'light' / 'dark' explicitly pin the theme by setting data-theme on <html>.
 *
 * The choice is persisted in localStorage under `lumiere:theme`. Reading from
 * localStorage MUST happen pre-paint via an inline script in app/layout.tsx,
 * otherwise users with a saved dark choice see a light flash on hydration.
 */

export type Theme = 'system' | 'light' | 'dark';

export const THEME_STORAGE_KEY = 'lumiere:theme';

export function isTheme(v: unknown): v is Theme {
  return v === 'system' || v === 'light' || v === 'dark';
}

/**
 * Inline script body — written to layout.tsx as a <script> child so it runs
 * before React hydrates and before first paint. Keep it small and dependency-
 * free; no imports allowed since it executes in the raw browser scope.
 */
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var t = localStorage.getItem('${THEME_STORAGE_KEY}');
    if (t === 'light' || t === 'dark') {
      document.documentElement.setAttribute('data-theme', t);
    }
    // Suppress the global transition during initial paint so the theme
    // doesn't animate in. The class is removed after hydration.
    document.documentElement.classList.add('theme-no-transition');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        document.documentElement.classList.remove('theme-no-transition');
      });
    });
  } catch (e) { /* localStorage unavailable; fall back to system */ }
})();
`;

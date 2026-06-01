import type { Metadata } from 'next';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'Lumière',
  description: 'Self-hosted gallery delivery',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Pre-paint theme pinning to avoid a light-mode flash on dark-saved sessions. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-bg text-ink antialiased">{children}</body>
    </html>
  );
}

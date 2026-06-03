import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Lumière',
  description: 'Self-hosted gallery delivery',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-bg text-ink antialiased">{children}</body>
    </html>
  );
}

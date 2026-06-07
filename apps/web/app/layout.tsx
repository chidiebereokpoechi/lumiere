import type { Metadata } from 'next';
import './globals.css';
import { DialogHost } from '@/components/ui/dialog';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3400';

// icon.png / apple-icon.png / opengraph-image.png under app/ are picked up by
// Next's file conventions automatically; we only enrich the textual metadata
// and Open Graph card here.
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'Lumière', template: '%s · Lumière' },
  description: 'Gallery delivery platform',
  openGraph: {
    title: 'Lumière',
    description: 'Gallery delivery platform',
    siteName: 'Lumière',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-bg text-ink antialiased">
        {children}
        <DialogHost />
      </body>
    </html>
  );
}

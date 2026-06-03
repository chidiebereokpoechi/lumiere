import { notFound } from 'next/navigation';
import { fetchAccess, fetchClientFiles, fetchFavorites } from '@/lib/api/client-gallery';
import { fetchClientComments } from '@/lib/api/comments';
import { fetchLists } from '@/lib/api/lists';
import { ApiError } from '@/lib/api-client';
import { PasswordGate } from '@/components/client/password-gate';
import { ClientGallery } from '@/components/client/client-gallery';

export const dynamic = 'force-dynamic';

interface Props {
  // Optional catch-all: `/g/:slug` and `/g/:slug/:collection` both land here.
  params: Promise<{ slug: string; collection?: string[] }>;
}

export default async function ClientGalleryPage({ params }: Props) {
  const { slug, collection } = await params;
  const initialCollection = collection?.[0] ?? null;

  let access;
  try {
    access = await fetchAccess(slug);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  if (access.state === 'expired' || access.state === 'archived' || access.state === 'draft') {
    const copy = {
      expired: { heading: 'This gallery has expired', body: 'Reach out to the creator to restore access.' },
      archived: { heading: 'This gallery is no longer available', body: 'Reach out to the creator if you need access.' },
      draft: { heading: 'This gallery isn’t published yet', body: 'Check back soon, or reach out to the creator.' },
    }[access.state];
    return (
      <main className="min-h-dvh grid place-items-center bg-bg px-6 text-center">
        <div className="max-w-sm">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-ink-muted">{access.gallery.title}</p>
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-ink-strong">{copy.heading}</h1>
          <p className="mt-2 text-sm text-ink-muted">{copy.body}</p>
        </div>
      </main>
    );
  }

  if (access.state === 'locked') {
    return <PasswordGate slug={slug} title={access.gallery.title} />;
  }

  // Unlocked / public — load the unified file list + favorites + comments + lists.
  const [{ gallery, folders, files }, favs, cmts, lists] = await Promise.all([
    fetchClientFiles(slug),
    fetchFavorites(slug).catch(() => ({ favorites: [] })),
    fetchClientComments(slug).catch(() => ({ comments: [] })),
    fetchLists(slug).catch(() => ({ email: null, lists: [] })),
  ]);
  return (
    <ClientGallery
      gallery={gallery}
      folders={folders}
      files={files}
      initialFavorites={favs.favorites.map((f) => f.fileId)}
      comments={cmts.comments}
      initialLists={lists.lists}
      initialEmail={lists.email}
      initialCollection={initialCollection}
    />
  );
}

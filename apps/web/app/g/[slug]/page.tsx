import { notFound } from 'next/navigation';
import { fetchAccess, fetchClientPhotos, fetchFavorites, fetchClientAttachments } from '@/lib/api/client-gallery';
import { fetchClientComments } from '@/lib/api/comments';
import { ApiError } from '@/lib/api-client';
import { PasswordGate } from '@/components/client/password-gate';
import { ClientGallery } from '@/components/client/client-gallery';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function ClientGalleryPage({ params }: Props) {
  const { slug } = await params;

  let access;
  try {
    access = await fetchAccess(slug);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  if (access.state === 'expired') {
    return (
      <main className="min-h-dvh grid place-items-center bg-bg px-6 text-center">
        <div className="max-w-sm">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-ink-muted">{access.gallery.title}</p>
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-ink-strong">This gallery has expired</h1>
          <p className="mt-2 text-sm text-ink-muted">Reach out to your photographer to restore access.</p>
        </div>
      </main>
    );
  }

  if (access.state === 'locked') {
    return <PasswordGate slug={slug} title={access.gallery.title} />;
  }

  // Unlocked / public — load photos + this session's favorites + files.
  const [{ gallery, photos, folders }, favs, atts, cmts] = await Promise.all([
    fetchClientPhotos(slug),
    fetchFavorites(slug).catch(() => ({ favorites: [] })),
    fetchClientAttachments(slug).catch(() => ({ attachments: [] })),
    fetchClientComments(slug).catch(() => ({ comments: [] })),
  ]);
  return (
    <ClientGallery
      gallery={gallery}
      photos={photos}
      folders={folders}
      initialFavorites={favs.favorites.map((f) => f.photoId)}
      attachments={atts.attachments}
      comments={cmts.comments}
    />
  );
}

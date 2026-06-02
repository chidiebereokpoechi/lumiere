import { notFound } from 'next/navigation';
import { fetchGallery, fetchMe } from '@/lib/api/galleries';
import { fetchAttachments } from '@/lib/api/attachments';
import { ApiError } from '@/lib/api-client';
import { GalleryHeader } from '@/components/admin/gallery-header';
import { AttachmentManager } from '@/components/admin/attachment-manager';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ galleryId: string }>;
}

export default async function GalleryFilesPage({ params }: Props) {
  const { galleryId } = await params;

  let gallery;
  try {
    gallery = await fetchGallery(galleryId);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const [me, attachments] = await Promise.all([fetchMe(), fetchAttachments(galleryId)]);

  return (
    <div>
      <GalleryHeader
        galleryId={galleryId}
        title={gallery.title}
        slug={gallery.slug}
        passwordProtected={!!gallery.passwordHash}
        user={{ name: me.name, email: me.email }}
        active="files"
      />

      <div className="px-8 py-6 pb-16">
        <AttachmentManager galleryId={galleryId} initialAttachments={attachments} />
      </div>
    </div>
  );
}

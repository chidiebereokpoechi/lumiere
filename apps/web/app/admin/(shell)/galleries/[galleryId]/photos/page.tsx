import { notFound } from 'next/navigation';
import { fetchGallery, fetchMe } from '@/lib/api/galleries';
import { fetchPhotos } from '@/lib/api/photos';
import { fetchFolders } from '@/lib/api/folders';
import { ApiError } from '@/lib/api-client';
import { GalleryHeader } from '@/components/admin/gallery-header';
import { PhotoManager } from '@/components/admin/photo-manager';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ galleryId: string }>;
}

export default async function GalleryPhotosPage({ params }: Props) {
  const { galleryId } = await params;

  let gallery;
  try {
    gallery = await fetchGallery(galleryId);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const [me, photos, folders] = await Promise.all([fetchMe(), fetchPhotos(galleryId), fetchFolders(galleryId)]);

  return (
    <div>
      <GalleryHeader
        galleryId={galleryId}
        title={gallery.title}
        slug={gallery.slug}
        passwordProtected={!!gallery.passwordHash}
        user={{ name: me.name, email: me.email }}
        active="photos"
      />

      <div className="px-8 py-6 pb-16">
        <PhotoManager
          galleryId={galleryId}
          initialPhotos={photos}
          initialFolders={folders}
          initialCoverPhotoId={gallery.coverPhotoId}
        />
      </div>
    </div>
  );
}

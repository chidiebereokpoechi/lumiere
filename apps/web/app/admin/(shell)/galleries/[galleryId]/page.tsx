import { notFound } from 'next/navigation';
import { fetchGallery, fetchMe } from '@/lib/api/galleries';
import { fetchWatermarkPresets } from '@/lib/api/watermarks';
import { ApiError } from '@/lib/api-client';
import { GalleryHeader } from '@/components/admin/gallery-header';
import { SettingsForm } from './settings-form';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ galleryId: string }>;
}

export default async function GalleryEditorPage({ params }: Props) {
  const { galleryId } = await params;

  let gallery;
  try {
    [gallery] = await Promise.all([fetchGallery(galleryId)]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const [me, watermarks] = await Promise.all([fetchMe(), fetchWatermarkPresets().catch(() => [])]);

  return (
    <div>
      <GalleryHeader
        galleryId={galleryId}
        title={gallery.title}
        slug={gallery.slug}
        passwordProtected={!!gallery.passwordHash}
        user={{ name: me.name, email: me.email }}
        active="settings"
      />

      <div className="px-8 py-6 pb-16">
        <div className="max-w-2xl">
          <SettingsForm gallery={gallery} watermarks={watermarks} />
        </div>
      </div>
    </div>
  );
}

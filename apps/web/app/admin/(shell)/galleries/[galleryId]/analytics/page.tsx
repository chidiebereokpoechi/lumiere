import { notFound } from "next/navigation";
import { fetchGallery, fetchMe } from "@/lib/api/galleries";
import { fetchGalleryAnalytics } from "@/lib/api/analytics";
import { ApiError } from "@/lib/api-client";
import { GalleryHeader } from "@/components/admin/gallery-header";
import { AnalyticsView } from "@/components/admin/analytics-view";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ galleryId: string }>;
}

export default async function GalleryAnalyticsPage({ params }: Props) {
  const { galleryId } = await params;

  let gallery;
  try {
    gallery = await fetchGallery(galleryId);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const [me, analytics] = await Promise.all([
    fetchMe(),
    fetchGalleryAnalytics(galleryId),
  ]);

  return (
    <div>
      <GalleryHeader
        galleryId={galleryId}
        title={gallery.title}
        slug={gallery.slug}
        passwordProtected={!!gallery.passwordHash}
        status={gallery.status ?? "active"}
        user={{ name: me.name, email: me.email }}
        active="analytics"
      />

      <div className="p-4 pb-16">
        <AnalyticsView galleryId={galleryId} analytics={analytics} />
      </div>
    </div>
  );
}

import { notFound } from "next/navigation";
import { fetchGallery, fetchMe } from "@/lib/api/galleries";
import { fetchWatermarkPresets } from "@/lib/api/watermarks";
import { fetchFiles, type GalleryFile } from "@/lib/api/files";
import { ApiError } from "@/lib/api-client";
import { GalleryHeader } from "@/components/admin/gallery-header";
import { GalleryCoverField } from "@/components/admin/gallery-cover-field";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

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
  const [me, watermarks, files] = await Promise.all([
    fetchMe(),
    fetchWatermarkPresets().catch(() => []),
    fetchFiles(galleryId).catch(() => [] as GalleryFile[]),
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
        active="settings"
      />

      <div className="flex flex-col-reverse lg:flex-row items-start gap-4 p-4 pb-16">
        <div className="w-full max-w-2xl">
          <SettingsForm gallery={gallery} watermarks={watermarks} />
        </div>
        {/* Cover editor - to the right of the main form on desktop. */}
        <aside className="w-full lg:w-80 lg:shrink-0 rounded-lg border border-border bg-surface p-4">
          <GalleryCoverField
            galleryId={galleryId}
            images={files.filter((f) => f.type === "image")}
            initialCover={{
              fileId: gallery.coverFileId,
              imageKey: gallery.coverImageKey,
              focalX: gallery.coverFocalX,
              focalY: gallery.coverFocalY,
            }}
          />
        </aside>
      </div>
    </div>
  );
}

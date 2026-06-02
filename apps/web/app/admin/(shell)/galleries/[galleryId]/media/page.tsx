import { notFound } from "next/navigation";
import { fetchGallery, fetchMe } from "@/lib/api/galleries";
import { fetchFiles } from "@/lib/api/files";
import { fetchFolders } from "@/lib/api/folders";
import { ApiError } from "@/lib/api-client";
import { GalleryHeader } from "@/components/admin/gallery-header";
import { FileManager } from "@/components/admin/file-manager";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ galleryId: string }>;
}

export default async function GalleryMediaPage({ params }: Props) {
  const { galleryId } = await params;

  let gallery;
  try {
    gallery = await fetchGallery(galleryId);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  // Fetch folders first — it lazily creates the default folder and re-files
  // any orphaned content, so files come back with folderIds set.
  const folders = await fetchFolders(galleryId);
  const [me, files] = await Promise.all([fetchMe(), fetchFiles(galleryId)]);

  return (
    <div>
      <GalleryHeader
        galleryId={galleryId}
        title={gallery.title}
        slug={gallery.slug}
        passwordProtected={!!gallery.passwordHash}
        user={{ name: me.name, email: me.email }}
        active="media"
      />

      <div className="px-8 py-6 pb-16">
        <FileManager
          galleryId={galleryId}
          gallerySlug={gallery.slug}
          initialFiles={files}
          initialFolders={folders}
          initialCoverFileId={gallery.coverFileId}
        />
      </div>
    </div>
  );
}

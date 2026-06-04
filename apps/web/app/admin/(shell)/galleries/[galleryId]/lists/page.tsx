import { notFound } from "next/navigation";
import { fetchGallery, fetchMe } from "@/lib/api/galleries";
import { fetchAdminLists, fetchAdminFavorites } from "@/lib/api/lists";
import { fetchAdminComments } from "@/lib/api/comments";
import { fetchFiles, type GalleryFile } from "@/lib/api/files";
import { ApiError } from "@/lib/api-client";
import { GalleryHeader } from "@/components/admin/gallery-header";
import { ExportFilenames } from "@/components/admin/export-filenames";
import { ListThumbs, type ThumbItem } from "@/components/admin/list-thumbs";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ galleryId: string }>;
}

function when(epoch: number): string {
  return formatDate(epoch);
}

export default async function GalleryListsPage({ params }: Props) {
  const { galleryId } = await params;

  let gallery;
  try {
    gallery = await fetchGallery(galleryId);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const [me, lists, favGroups, files, comments] = await Promise.all([
    fetchMe(),
    fetchAdminLists(galleryId).catch(() => []),
    fetchAdminFavorites(galleryId).catch(() => []),
    fetchFiles(galleryId).catch(() => [] as GalleryFile[]),
    fetchAdminComments(galleryId).catch(() => []),
  ]);
  const fileMap = new Map(files.map((f) => [f.id, f]));
  // Comments grouped by the file they're on, for tile badges + the preview.
  const commentsByFile = new Map<string, ThumbItem["comments"]>();
  for (const c of comments) {
    if (!c.fileId) continue;
    const arr = commentsByFile.get(c.fileId) ?? [];
    arr.push({
      author: c.clientEmail || c.clientName,
      body: c.body,
      scope: c.scope,
      collection: c.collection,
      createdAt: c.createdAt,
      isApproved: c.isApproved,
    });
    commentsByFile.set(c.fileId, arr);
  }
  // Original filenames (for Lightroom etc.), in list order, skipping removed items.
  const namesOf = (ids: string[]) =>
    ids
      .map((id) => fileMap.get(id)?.filenameOriginal)
      .filter((n): n is string => !!n);
  // Plain serializable items for the (client) thumbnail strip.
  const itemsOf = (ids: string[]): ThumbItem[] =>
    ids.map((id) => {
      const f = fileMap.get(id);
      return {
        id,
        type: f?.type ?? null,
        name: f?.displayName ?? f?.filenameOriginal ?? "Removed item",
        comments: commentsByFile.get(id) ?? [],
      };
    });
  const allFavIds = [...new Set(favGroups.flatMap((g) => g.fileIds))];

  return (
    <div>
      <GalleryHeader
        galleryId={galleryId}
        title={gallery.title}
        slug={gallery.slug}
        passwordProtected={!!gallery.passwordHash}
        status={gallery.status ?? "active"}
        user={{ name: me.name, email: me.email }}
        active="lists"
      />

      <div className="flex flex-col gap-4 p-4 pb-16">
        {/* Favorites - exportable, optionally per client */}
        <section className="rounded-lg border border-border bg-surface p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-bold text-ink-strong">Favorites</h2>
            <ExportFilenames
              filenames={namesOf(allFavIds)}
              downloadName={`${gallery.slug}-favorites`}
              label="Export all"
            />
          </div>
          {allFavIds.length === 0 ? (
            <p className="mt-1 text-sm text-ink-muted">No favorites yet.</p>
          ) : (
            <div className="mt-3 space-y-4">
              {favGroups.map((g, i) => (
                <div key={g.clientEmail ?? `anon-${i}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-ink-muted">
                      {g.clientEmail ?? "unknown"} · {g.fileIds.length} item
                      {g.fileIds.length !== 1 ? "s" : ""}
                    </p>
                    <ExportFilenames
                      filenames={namesOf(g.fileIds)}
                      downloadName={`${gallery.slug}-favorites-${g.clientEmail ?? "anon"}`}
                    />
                  </div>
                  <ListThumbs
                    galleryId={galleryId}
                    items={itemsOf(g.fileIds)}
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        {lists.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface px-4 py-12 text-center">
            <p className="text-sm text-ink-muted">No client lists yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {lists.map((l) => (
              <section
                key={l.id}
                className="rounded-lg border border-border bg-surface p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-base font-bold text-ink-strong">
                    {l.name}
                  </h2>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-ink-muted tabular-nums">
                      {when(l.createdAt)}
                    </span>
                    <ExportFilenames
                      filenames={namesOf(l.fileIds)}
                      downloadName={`${gallery.slug}-${l.name}`}
                    />
                  </div>
                </div>
                <p className="mt-0.5 text-sm text-ink-muted">
                  {l.clientEmail ?? "unknown"} · {l.fileIds.length} item
                  {l.fileIds.length !== 1 ? "s" : ""}
                </p>
                <ListThumbs galleryId={galleryId} items={itemsOf(l.fileIds)} />
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import { notFound } from 'next/navigation';
import { fetchGallery, fetchMe } from '@/lib/api/galleries';
import { fetchAdminLists } from '@/lib/api/lists';
import { fetchFiles, type GalleryFile } from '@/lib/api/files';
import { ApiError } from '@/lib/api-client';
import { GalleryHeader } from '@/components/admin/gallery-header';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ galleryId: string }>;
}

function when(epoch: number): string {
  return new Date(epoch * 1000).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
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
  const [me, lists, files] = await Promise.all([
    fetchMe(),
    fetchAdminLists(galleryId).catch(() => []),
    fetchFiles(galleryId).catch(() => [] as GalleryFile[]),
  ]);
  const fileMap = new Map(files.map((f) => [f.id, f]));

  return (
    <div>
      <GalleryHeader
        galleryId={galleryId}
        title={gallery.title}
        slug={gallery.slug}
        passwordProtected={!!gallery.passwordHash}
        user={{ name: me.name, email: me.email }}
        active="lists"
      />

      <div className="px-8 py-6 pb-16">
        <div className="mb-5">
          <h1 className="text-xl font-extrabold tracking-tight text-ink-strong">Client lists</h1>
          <p className="mt-1 text-sm text-ink-muted">Selections clients have built. Each is tied to the email they provided.</p>
        </div>

        {lists.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface px-6 py-12 text-center">
            <p className="text-sm text-ink-muted">No client lists yet.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {lists.map((l) => (
              <section key={l.id} className="rounded-lg border border-border bg-surface p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-base font-bold text-ink-strong">{l.name}</h2>
                  <span className="text-xs text-ink-subtle tabular-nums">{when(l.createdAt)}</span>
                </div>
                <p className="mt-0.5 text-sm text-ink-muted">
                  {l.clientEmail ?? 'unknown'} · {l.fileIds.length} item{l.fileIds.length !== 1 ? 's' : ''}
                </p>

                {l.fileIds.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {l.fileIds.map((fid) => {
                      const f = fileMap.get(fid);
                      const name = f?.displayName ?? f?.filenameOriginal ?? 'Removed item';
                      return (
                        <div key={fid} title={name} className="h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border bg-surface-sunken">
                          {f?.type === 'image' ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={`/img/${galleryId}/${fid}/thumb`} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <span className="flex h-full w-full flex-col items-center justify-center gap-1 p-1 text-center">
                              <span className="text-[10px] font-semibold uppercase text-ink-subtle">{f?.type ?? '—'}</span>
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

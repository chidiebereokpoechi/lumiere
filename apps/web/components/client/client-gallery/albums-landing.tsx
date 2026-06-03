"use client";

import type { ClientFile } from "@/lib/api/client-gallery";
import { FileDoc, Heart, ImageIcon, Music, Play } from "@/components/ui/icons";

export interface AlbumItem {
  key: string;
  label: string;
  count: number;
  peek: ClientFile[]; // up to 4, for the cover mosaic
  favorite?: boolean;
  onOpen: () => void;
}

// iOS-Photos-style landing: a grid of album cards under "Collections" (sets) and
// "Your lists". Each card shows a 2×2 peek of its contents.
export function AlbumsLanding({
  collections,
  yourLists,
}: {
  collections: AlbumItem[];
  yourLists: AlbumItem[];
}) {
  return (
    <div className="px-2 sm:px-8 pb-24 space-y-8">
      {collections.length > 0 && (
        <AlbumSection title="Collections" items={collections} />
      )}
      {yourLists.length > 0 && (
        <AlbumSection title="Your lists" items={yourLists} />
      )}
    </div>
  );
}

function AlbumSection({ title, items }: { title: string; items: AlbumItem[] }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-bold tracking-wider text-ink-subtle">
        {title}
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4">
        {items.map((a) => (
          <AlbumCard key={a.key} item={a} />
        ))}
      </div>
    </section>
  );
}

function AlbumCard({ item }: { item: AlbumItem }) {
  const { label, count, peek, favorite, onOpen } = item;
  return (
    <button type="button" onClick={onOpen} className="block w-full text-left">
      <div className="relative aspect-square w-full overflow-hidden rounded-md bg-surface-sunken">
        {peek.length === 0 ? (
          <div className="h-full w-full flex items-center justify-center text-ink-subtle">
            <ImageIcon size={24} />
          </div>
        ) : peek.length === 1 ? (
          <PeekThumb f={peek[0]!} />
        ) : (
          <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-0.5">
            {[0, 1, 2, 3].map((i) =>
              peek[i] ? (
                <PeekThumb key={i} f={peek[i]!} />
              ) : (
                <div key={i} className="bg-surface" />
              ),
            )}
          </div>
        )}
        {favorite && (
          <span className="absolute top-2 right-2 text-heart drop-shadow">
            <Heart size={20} />
          </span>
        )}
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-ink-strong truncate">
          {label}
        </span>
        <span className="shrink-0 text-xs text-ink-subtle tabular-nums">
          {count}
        </span>
      </div>
    </button>
  );
}

function PeekThumb({ f }: { f: ClientFile }) {
  if (f.thumbUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={f.thumbUrl}
        alt=""
        loading="lazy"
        draggable={false}
        className="h-full w-full object-cover select-none"
      />
    );
  }
  const Glyph =
    f.type === "audio" ? Music : f.type === "video" ? Play : FileDoc;
  return (
    <span className="flex h-full w-full items-center justify-center bg-surface text-ink-muted">
      <Glyph size={20} />
    </span>
  );
}

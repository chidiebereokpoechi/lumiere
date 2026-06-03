"use client";

import type { ClientFile } from "@/lib/api/client-gallery";
import { Folder, Heart } from "@/components/ui/icons";

export interface AlbumItem {
  key: string;
  label: string;
  count: number;
  peek: ClientFile[]; // peek[0] is used as the cover
  favorite?: boolean;
  onOpen: () => void;
}

// iOS-Photos-ish landing: album cards are squares with the set's first image as
// a cover, the icon + name + count layered over it.
export function AlbumsLanding({
  collections,
  yourLists,
}: {
  collections: AlbumItem[];
  yourLists: AlbumItem[];
}) {
  return (
    <div className="flex flex-col px-2 sm:px-8 gap-4 sm:gap-8">
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
      <h2 className="mb-2 sm:mb-4 text-sm font-bold tracking-wider text-ink-muted">
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
  const Icon = favorite ? Heart : Folder;
  const cover = peek.find((f) => f.thumbUrl)?.thumbUrl ?? null;

  return (
    <button type="button" onClick={onOpen} className="block w-full text-left">
      <div className="relative aspect-square w-full overflow-hidden rounded-md bg-surface-sunken">
        {cover && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cover}
              alt=""
              loading="lazy"
              draggable={false}
              className="absolute inset-0 h-full w-full object-cover select-none"
            />
            <div className="absolute inset-0 bg-black/40" />
          </>
        )}
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 p-3 text-center pointer-events-none">
          <Icon
            size={32}
            className={
              favorite
                ? "text-heart drop-shadow"
                : cover
                  ? "text-white drop-shadow"
                  : "text-ink-muted"
            }
          />
          <span
            className={`text-sm font-semibold truncate max-w-full ${cover ? "text-white drop-shadow" : "text-ink-strong"}`}
          >
            {label}
          </span>
          <span
            className={`text-xs tabular-nums ${cover ? "text-white/80 drop-shadow" : "text-ink-muted"}`}
          >
            {count}
          </span>
        </div>
      </div>
    </button>
  );
}

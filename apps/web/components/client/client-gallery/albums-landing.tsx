"use client";

import type { ClientFile, MinimalGallery } from "@/lib/api/client-gallery";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import {
  External,
  Folder,
  Heart,
  Instagram,
  LinkIcon,
  Mail,
  Zip,
} from "@/components/ui/icons";

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
  gallery,
  collections,
  yourLists,
  canDownload,
  onDownloadAll,
}: {
  gallery: MinimalGallery;
  collections: AlbumItem[];
  yourLists: AlbumItem[];
  canDownload: boolean;
  onDownloadAll: () => void;
}) {
  const date = gallery.eventDate
    ? formatDate(gallery.eventDate, {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  async function shareLink() {
    const url = window.location.href;
    const data = { title: gallery.title, url };
    const nav = navigator as Navigator & {
      canShare?: (d: ShareData) => boolean;
    };
    try {
      if (nav.canShare?.(data) && nav.share) {
        await nav.share(data);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied to clipboard");
      } else {
        toast.error("Sharing isn’t supported on this browser");
      }
    } catch (err) {
      // AbortError = user dismissed the share sheet; silent.
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        toast.error("Couldn’t share the link");
      }
    }
  }

  const mailtoHref = gallery.creatorEmail
    ? `mailto:${gallery.creatorEmail}?subject=${encodeURIComponent(`Re: ${gallery.title}`)}`
    : null;
  const instagramHref = gallery.creatorInstagram
    ? `https://instagram.com/${gallery.creatorInstagram.replace(/^@+/, "")}`
    : null;

  return (
    <div className="flex flex-col px-2 sm:px-4 gap-6 sm:gap-10">
      <header className="pt-8 sm:pt-12 text-center">
        <h1 className="text-3xl sm:text-5xl font-[700]! tracking-tight text-ink-strong">
          {gallery.title}
        </h1>
        {(date || gallery.clientName) && (
          <div className="mt-3 flex flex-col items-center gap-1 text-sm text-ink-subtle tabular-nums">
            {date && <p>{date}</p>}
            {gallery.clientName && (
              <p className="not-tabular-nums">{gallery.clientName}</p>
            )}
          </div>
        )}
        <div className="mt-4 px-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
          {canDownload && (
            <ActionLink
              icon={<Zip size={16} />}
              label="Download ZIP"
              onClick={onDownloadAll}
            />
          )}
          <ActionLink
            icon={<LinkIcon size={16} />}
            label="Share link"
            onClick={shareLink}
          />
          {gallery.creatorWebsite && (
            <ActionLink
              icon={<External size={16} />}
              label="Website"
              href={gallery.creatorWebsite}
              external
            />
          )}
          {mailtoHref && (
            <ActionLink
              icon={<Mail size={16} />}
              label="Email"
              href={mailtoHref}
            />
          )}
          {instagramHref && (
            <ActionLink
              icon={<Instagram size={16} />}
              label="Instagram"
              href={instagramHref}
              external
            />
          )}
        </div>
      </header>
      {collections.length > 0 && (
        <AlbumSection title="Collections" items={collections} />
      )}
      {yourLists.length > 0 && (
        <AlbumSection title="Your lists" items={yourLists} />
      )}
    </div>
  );
}

// Renders as <a> when given an `href` (mailto / external URL — the browser
// handles those natively; a button calling window.location.href = mailto:…
// is often blocked or no-ops). Otherwise renders as a <button>.
function ActionLink({
  icon,
  label,
  onClick,
  href,
  external,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  href?: string;
  external?: boolean;
}) {
  const cls =
    "inline-flex items-center gap-2 text-ink-muted hover:text-ink-strong transition-colors";
  const content = (
    <>
      <span className="shrink-0">{icon}</span>
      <span>{label}</span>
    </>
  );
  if (href) {
    return (
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        className={cls}
      >
        {content}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {content}
    </button>
  );
}

function AlbumSection({ title, items }: { title: string; items: AlbumItem[] }) {
  return (
    <section>
      <h2 className="mb-2 sm:mb-3 text-sm font-bold tracking-wider text-ink-muted">
        {title}
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
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
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-md bg-surface-sunken">
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

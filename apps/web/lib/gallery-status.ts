// Tiny client-side bridge so the header status control and the settings-form
// status select stay in sync without a full refresh.

export type GalleryStatus = 'active' | 'draft' | 'archived';

const EVENT = 'lumiere:gallery-status';

export function broadcastGalleryStatus(galleryId: string, status: GalleryStatus): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { galleryId, status } }));
}

export function onGalleryStatus(cb: (galleryId: string, status: GalleryStatus) => void): () => void {
  const handler = (e: Event) => {
    const d = (e as CustomEvent<{ galleryId: string; status: GalleryStatus }>).detail;
    if (d) cb(d.galleryId, d.status);
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

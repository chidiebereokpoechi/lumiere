import { apiServer } from '@/lib/api-client';

// Server-side fetcher for the photographer's gallery list. Matches the shape
// returned by GET /api/galleries on the backend (galleries.ts admin route).
export interface GallerySummary {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  status: 'active' | 'archived' | 'draft' | null;
  coverFileId: string | null;
  clientName: string | null;
  clientEmail: string | null;
  eventDate: number | null;
  eventType: string | null;
  viewCount: number | null;
  updatedAt: number;
  createdAt: number;
  photoCount: number;
}

// Full gallery row (admin GET /api/galleries/:galleryId).
export interface GalleryDetail {
  id: string;
  photographerId: string;
  slug: string;
  title: string;
  subtitle: string | null;
  coverFileId: string | null;
  passwordHash: string | null;
  status: 'active' | 'archived' | 'draft' | null;
  downloadMode: 'none' | 'watermarked' | 'full' | 'selected' | null;
  expiresAt: number | null;
  gracePeriodDays: number | null;
  allowFavorites: number | null;
  allowComments: number | null;
  allowDownload: number | null;
  clientName: string | null;
  clientEmail: string | null;
  eventDate: number | null;
  eventType: string | null;
  layout: 'grid' | 'masonry' | 'slideshow' | null;
  colorTheme: string | null;
  customCss: string | null;
  watermarkPresetId: string | null;
  sortOrder: string | null;
  notifyOnView: number | null;
  viewCount: number | null;
  createdAt: number;
  updatedAt: number;
}

export function fetchGallery(id: string) {
  return apiServer<GalleryDetail>(`/api/galleries/${id}`);
}

export interface CurrentPhotographer {
  id: string;
  email: string;
  name: string;
  brandName: string | null;
}

export function fetchGalleries() {
  return apiServer<GallerySummary[]>('/api/galleries');
}

export function fetchMe() {
  return apiServer<CurrentPhotographer>('/api/auth/me');
}

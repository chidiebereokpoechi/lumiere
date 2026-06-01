import { apiServer } from '@/lib/api-client';

// Server-side fetcher for the photographer's gallery list. Matches the shape
// returned by GET /api/galleries on the backend (galleries.ts admin route).
export interface GallerySummary {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  status: 'active' | 'archived' | 'draft' | null;
  coverPhotoId: string | null;
  clientName: string | null;
  clientEmail: string | null;
  eventDate: number | null;
  eventType: string | null;
  viewCount: number | null;
  updatedAt: number;
  createdAt: number;
  photoCount: number;
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

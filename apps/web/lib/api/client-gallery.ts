import { apiServer } from '@/lib/api-client';

export type AccessState = 'ok' | 'locked' | 'expired';

export interface MinimalGallery {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  coverPhotoId: string | null;
  layout: 'grid' | 'masonry' | 'slideshow';
  colorTheme: string;
  customCss: string | null;
  hasPassword: boolean;
  allowDownload: boolean;
  downloadMode: string;
  allowFavorites: boolean;
  expiresAt: number | null;
  gracePeriodDays: number;
  eventDate: number | null;
  eventType: string | null;
}

export interface ClientPhoto {
  id: string;
  width: number | null;
  height: number | null;
  colorPalette: string[] | null;
  position: number | null;
  thumbUrl: string;
  previewUrl: string;
}

export interface AccessResponse {
  state: AccessState;
  gallery: MinimalGallery;
}

export interface ClientPhotosResponse {
  gallery: MinimalGallery;
  photos: ClientPhoto[];
}

export function fetchAccess(slug: string) {
  return apiServer<AccessResponse>(`/api/gallery/${slug}/access`);
}

export function fetchClientPhotos(slug: string) {
  return apiServer<ClientPhotosResponse>(`/api/gallery/${slug}/photos`);
}

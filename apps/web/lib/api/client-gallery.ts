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
  allowComments: boolean;
  expiresAt: number | null;
  gracePeriodDays: number;
  eventDate: number | null;
  eventType: string | null;
}

export interface ClientFolder {
  id: string;
  name: string;
  coverPhotoId: string | null;
}

export interface ClientPhoto {
  id: string;
  folderId: string | null;
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
  folders: ClientFolder[];
  photos: ClientPhoto[];
}

export function fetchAccess(slug: string) {
  return apiServer<AccessResponse>(`/api/gallery/${slug}/access`);
}

export function fetchClientPhotos(slug: string) {
  return apiServer<ClientPhotosResponse>(`/api/gallery/${slug}/photos`);
}

export interface FavoritesResponse {
  favorites: { photoId: string; note: string | null; createdAt: number }[];
}

export function fetchFavorites(slug: string) {
  return apiServer<FavoritesResponse>(`/api/gallery/${slug}/favorites`);
}

export interface ClientAttachment {
  id: string;
  filename: string;
  mimeType: string | null;
  fileSize: number | null;
  description: string | null;
  position: number | null;
}

export function fetchClientAttachments(slug: string) {
  return apiServer<{ attachments: ClientAttachment[] }>(`/api/gallery/${slug}/attachments`);
}

import { apiServer } from '@/lib/api-client';
import type { FileType } from '@/lib/api/files';

export type AccessState = 'ok' | 'locked' | 'expired';

export interface MinimalGallery {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  coverFileId: string | null;
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
  coverFileId: string | null;
}

// Unified media item as served to clients. Images carry thumb/preview URLs;
// video/audio/file carry a stream URL. All carry a download URL.
export interface ClientFile {
  id: string;
  folderId: string | null;
  type: FileType;
  filename: string;
  mimeType: string | null;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  colorPalette: string[] | null;
  position: number | null;
  thumbUrl: string | null;
  previewUrl: string | null;
  streamUrl: string | null;
  downloadUrl: string;
}

export interface AccessResponse {
  state: AccessState;
  gallery: MinimalGallery;
}

export interface ClientFilesResponse {
  gallery: MinimalGallery;
  folders: ClientFolder[];
  files: ClientFile[];
}

export function fetchAccess(slug: string) {
  return apiServer<AccessResponse>(`/api/gallery/${slug}/access`);
}

export function fetchClientFiles(slug: string) {
  return apiServer<ClientFilesResponse>(`/api/gallery/${slug}/files`);
}

export interface FavoritesResponse {
  favorites: { fileId: string; note: string | null; createdAt: number }[];
}

export function fetchFavorites(slug: string) {
  return apiServer<FavoritesResponse>(`/api/gallery/${slug}/favorites`);
}

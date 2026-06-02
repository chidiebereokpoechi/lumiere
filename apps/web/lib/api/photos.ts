import { apiServer } from '@/lib/api-client';

// Photo row as returned by GET /api/galleries/:galleryId/photos
// (apps/api/src/db/schema.ts → photos table).
export interface Photo {
  id: string;
  galleryId: string;
  folderId: string | null;
  filenameOriginal: string;
  s3KeyOriginal: string | null;
  s3KeyPreview: string | null;
  s3KeyThumbnail: string | null;
  s3KeyWatermarked: string | null;
  width: number | null;
  height: number | null;
  fileSize: number | null;
  mimeType: string | null;
  exifData: string | null;
  colorPalette: string | null;
  position: number | null;
  uploadStatus: 'processing' | 'ready' | 'error' | null;
  errorMessage: string | null;
  createdAt: number;
}

export function fetchPhotos(galleryId: string) {
  return apiServer<Photo[]>(`/api/galleries/${galleryId}/photos`);
}

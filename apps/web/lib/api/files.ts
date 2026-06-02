import { apiServer } from '@/lib/api-client';

export type FileType = 'image' | 'video' | 'audio' | 'file';

// Admin file row (GET /api/galleries/:galleryId/files).
export interface GalleryFile {
  id: string;
  galleryId: string;
  folderId: string | null;
  type: FileType;
  filenameOriginal: string;
  displayName: string | null;
  description: string | null;
  mimeType: string | null;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  position: number | null;
  uploadStatus: 'processing' | 'ready' | 'error' | null;
  createdAt: number;
}

export function fetchFiles(galleryId: string) {
  return apiServer<GalleryFile[]>(`/api/galleries/${galleryId}/files`);
}

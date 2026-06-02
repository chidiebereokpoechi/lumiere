import { apiServer } from '@/lib/api-client';

export interface Attachment {
  id: string;
  galleryId: string;
  filenameOriginal: string;
  displayName: string | null;
  description: string | null;
  mimeType: string | null;
  fileSize: number | null;
  position: number | null;
  folderId: string | null;
  createdAt: number;
}

export function fetchAttachments(galleryId: string) {
  return apiServer<Attachment[]>(`/api/galleries/${galleryId}/attachments`);
}

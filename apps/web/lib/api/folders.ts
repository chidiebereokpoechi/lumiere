import { apiServer } from '@/lib/api-client';

export interface Folder {
  id: string;
  name: string;
  position: number | null;
  hidden: boolean;
  coverFileId: string | null;
  photoCount: number;
}

export function fetchFolders(galleryId: string) {
  return apiServer<Folder[]>(`/api/galleries/${galleryId}/folders`);
}

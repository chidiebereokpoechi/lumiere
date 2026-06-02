import { apiServer } from '@/lib/api-client';

// A client-made list of files. `fileIds` preserves add order.
export interface ClientList {
  id: string;
  name: string;
  fileIds: string[];
  createdAt: number;
}

export interface ListsResponse {
  email: string | null;
  lists: ClientList[];
}

// Server-side fetch (forwards the gallery-session cookie) for initial state.
export function fetchLists(slug: string) {
  return apiServer<ListsResponse>(`/api/gallery/${slug}/lists`);
}

// Admin view — every list in the gallery with the client's email attached.
export interface AdminList {
  id: string;
  name: string;
  clientEmail: string | null;
  fileIds: string[];
  createdAt: number;
}

export function fetchAdminLists(galleryId: string) {
  return apiServer<AdminList[]>(`/api/galleries/${galleryId}/lists`);
}

import { apiServer } from '@/lib/api-client';

// Per-item comment as returned by GET /api/gallery/:slug/comments. For 'set'
// scope these are approved public comments (author = email); for private
// (list/favorites) scope it's only the caller's own note (`mine`).
export interface ItemComment {
  id: string;
  body: string;
  author: string | null;
  createdAt: number;
  mine: boolean;
  pending?: boolean;
}

export type CommentScope = 'set' | 'list' | 'favorites';

// Admin shape — every comment, with scope + approval state.
export interface AdminComment {
  id: string;
  fileId: string | null;
  clientName: string | null;
  clientEmail: string | null;
  body: string;
  isApproved: boolean;
  scope: CommentScope;
  listName: string | null;
  createdAt: number;
}

export function fetchAdminComments(galleryId: string) {
  return apiServer<AdminComment[]>(`/api/galleries/${galleryId}/comments`);
}

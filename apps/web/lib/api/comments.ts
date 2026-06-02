import { apiServer } from '@/lib/api-client';

// Public (approved-only) comment shape.
export interface ClientComment {
  id: string;
  photoId: string | null;
  clientName: string | null;
  body: string;
  createdAt: number;
}

export function fetchClientComments(slug: string) {
  return apiServer<{ comments: ClientComment[] }>(`/api/gallery/${slug}/comments`);
}

// Admin shape — includes pending comments + email + approval state.
export interface AdminComment {
  id: string;
  photoId: string | null;
  clientName: string | null;
  clientEmail: string | null;
  body: string;
  isApproved: boolean;
  createdAt: number;
}

export function fetchAdminComments(galleryId: string) {
  return apiServer<AdminComment[]>(`/api/galleries/${galleryId}/comments`);
}

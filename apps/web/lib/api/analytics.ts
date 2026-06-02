import { apiServer } from '@/lib/api-client';

export interface DayCount {
  day: string; // YYYY-MM-DD
  count: number;
}

export interface GalleryAnalytics {
  galleryId: string;
  since: number;
  totals: {
    views: number;
    downloads: number;
    favorites: number;
  };
  viewsByDay: DayCount[];
  downloadsByDay: DayCount[];
  favoritesByFile: { fileId: string; count: number }[];
  deviceSplit: {
    mobile: number;
    tablet: number;
    desktop: number;
    unknown: number;
  };
  clients: ClientActivity[];
}

// Per-client activity, keyed by the email clients provide before favoriting.
export interface ClientActivity {
  email: string;
  favorites: number;
  lists: number;
  downloads: number;
  lastAt: number;
}

export function fetchGalleryAnalytics(galleryId: string) {
  return apiServer<GalleryAnalytics>(`/api/galleries/${galleryId}/analytics`);
}

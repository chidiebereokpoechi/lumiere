import { apiServer } from "@/lib/api-client";

export interface AdminRow {
  id: string;
  email: string;
  name: string;
  brandName: string | null;
  createdAt: number;
}

export function fetchAdmins() {
  return apiServer<AdminRow[]>("/api/admins");
}

import { useAdminAuthStore, getAdminHeaders } from "@/store/useAdminAuthStore";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

export async function adminFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> ?? {}),
    ...getAdminHeaders(),
  };
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401) {
    useAdminAuthStore.getState().logout();
    window.location.href = `${BASE}/admin/login`;
  }
  return res;
}

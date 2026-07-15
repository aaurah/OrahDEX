import { useAdminAuthStore } from "@/store/useAdminAuthStore";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

/**
 * Authenticated fetch wrapper for admin API calls.
 *
 * Sends the HttpOnly admin_session cookie automatically via
 * credentials: "include".  On a 401 response, clears the client-side auth
 * state and redirects to /admin/login.
 *
 * Usage:
 *   const res = await adminFetch("/api/admin/something");
 *   const res = await adminFetch("/api/admin/foo", { method: "POST", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } });
 */
export async function adminFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    credentials: "include",
  });
  if (res.status === 401) {
    useAdminAuthStore.getState().logout();
    window.location.href = `${BASE}/admin/login`;
  }
  return res;
}

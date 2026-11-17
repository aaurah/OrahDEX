import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/api";
import { useAdminAuthStore } from "@/store/useAdminAuthStore";

export function useVerifiedAdminSession() {
  const isAuthenticated = useAdminAuthStore((state) => state.isAuthenticated);
  const token = useAdminAuthStore((state) => state.token);
  const [isVerifiedAdmin, setIsVerifiedAdmin] = useState(false);

  useEffect(() => {
    let active = true;
    setIsVerifiedAdmin(false);

    if (!isAuthenticated || !token) {
      return () => {
        active = false;
      };
    }

    const verify = async () => {
      try {
        const response = await fetch(`${API_BASE}/admin/auth/session`, {
          headers: { "x-admin-token": token },
          cache: "no-store",
        });
        if (active) setIsVerifiedAdmin(response.ok);
      } catch {
        if (active) setIsVerifiedAdmin(false);
      }
    };

    void verify();
    const intervalId = window.setInterval(() => void verify(), 60_000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [isAuthenticated, token]);

  return isVerifiedAdmin;
}

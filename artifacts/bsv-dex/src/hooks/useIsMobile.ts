import { useEffect, useState } from "react";

const MOBILE_BREAKPOINT = 768;

function isMobileUA(): boolean {
  return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState<boolean>(
    () => window.innerWidth < MOBILE_BREAKPOINT || isMobileUA()
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches || isMobileUA());
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return mobile;
}

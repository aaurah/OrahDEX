import { useState, useEffect, useRef } from 'react';

/**
 * Monitors real internet connectivity.
 * Uses navigator.onLine events as the primary signal, plus a periodic
 * fetch ping to confirm actual reachability (not just LAN connection).
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(navigator.onLine);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const ping = async () => {
    try {
      // Fetch a tiny cacheless resource; HEAD is enough
      await fetch('https://www.google.com/generate_204', {
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-store',
      });
      setOnline(true);
    } catch {
      setOnline(false);
    }
  };

  useEffect(() => {
    const handleOnline  = () => { setOnline(true);  ping(); };
    const handleOffline = () => setOnline(false);

    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial + periodic check every 30 s
    ping();
    timerRef.current = setInterval(ping, 30_000);

    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return online;
}

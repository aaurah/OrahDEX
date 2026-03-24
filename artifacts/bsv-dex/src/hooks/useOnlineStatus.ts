import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Reliable internet-connectivity monitor.
 *
 * Three-layer detection:
 *  1. navigator.onLine — fires instantly when the radio drops
 *  2. Fetch /api/ping with a 5 s timeout — confirms packets actually flow
 *  3. Poll every 10 s — keeps state fresh; shrinks recovery detection lag
 *
 * Pinning our own /api/ping means:
 *  • No CORS issues (same origin through the Replit proxy)
 *  • If the device has no network at all, the request throws immediately
 *  • If /api/ping is unreachable, the 5 s timeout marks us offline
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(navigator.onLine);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRef = useRef<{ controller: AbortController; timeout: ReturnType<typeof setTimeout> } | null>(null);

  const ping = useCallback(async () => {
    // Cancel any previous in-flight ping cleanly (mark as superseded, not offline)
    if (activeRef.current) {
      activeRef.current.controller.abort('superseded');
      clearTimeout(activeRef.current.timeout);
      activeRef.current = null;
    }

    // Trust the browser immediately if it says offline
    if (!navigator.onLine) {
      setOnline(false);
      return;
    }

    const controller = new AbortController();
    // Kill after 5 s — counts as offline
    const timeout = setTimeout(() => controller.abort('timeout'), 5_000);
    activeRef.current = { controller, timeout };

    try {
      await fetch('/api/ping', {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      });
      setOnline(true);
    } catch (err: unknown) {
      const reason = (err as { name?: string; message?: string; cause?: unknown })?.cause ?? err;
      const isSuperseded =
        controller.signal.reason === 'superseded' ||
        (reason as { message?: string })?.message === 'superseded';

      // Don't flip offline for pings we intentionally cancelled
      if (!isSuperseded) {
        setOnline(false);
      }
    } finally {
      clearTimeout(timeout);
      if (activeRef.current?.controller === controller) {
        activeRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    const goOnline  = () => { setOnline(true);  ping(); };
    const goOffline = () => { setOnline(false); };

    window.addEventListener('online',  goOnline);
    window.addEventListener('offline', goOffline);

    ping();
    timerRef.current = setInterval(ping, 10_000);

    return () => {
      window.removeEventListener('online',  goOnline);
      window.removeEventListener('offline', goOffline);
      if (timerRef.current) clearInterval(timerRef.current);
      if (activeRef.current) {
        activeRef.current.controller.abort('superseded');
        clearTimeout(activeRef.current.timeout);
      }
    };
  }, [ping]);

  return online;
}

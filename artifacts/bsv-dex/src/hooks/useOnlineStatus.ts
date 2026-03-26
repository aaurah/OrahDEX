import { useState, useEffect, useRef, useCallback } from 'react';

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';

/**
 * Reliable internet-connectivity monitor.
 *
 * Three-layer detection:
 *  1. navigator.onLine — fires instantly when the radio drops
 *  2. Fetch ${BASE_URL}/api/ping with a 5 s timeout — confirms packets flow
 *  3. Poll every 5 s — keeps state fresh; shrinks recovery detection lag
 *
 * On reconnection: retries every 2 s up to 8 times before falling back to
 * the normal 5-second poll — ensures near-instant UI recovery after a dropout.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(navigator.onLine);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef  = useRef<{ controller: AbortController; timeout: ReturnType<typeof setTimeout> } | null>(null);
  const retryCount = useRef(0);

  const cancelActive = useCallback(() => {
    if (activeRef.current) {
      activeRef.current.controller.abort('superseded');
      clearTimeout(activeRef.current.timeout);
      activeRef.current = null;
    }
  }, []);

  const ping = useCallback(async (): Promise<boolean> => {
    cancelActive();

    if (!navigator.onLine) {
      setOnline(false);
      return false;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort('timeout'), 5_000);
    activeRef.current = { controller, timeout };

    try {
      const res = await fetch(`${BASE_URL}/api/ping`, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (res.ok || res.status === 204) {
        setOnline(true);
        return true;
      }
      setOnline(false);
      return false;
    } catch (err: unknown) {
      const reason = (err as { cause?: unknown })?.cause ?? err;
      const isSuperseded =
        controller.signal.reason === 'superseded' ||
        (reason as { message?: string })?.message === 'superseded';
      if (!isSuperseded) setOnline(false);
      return false;
    } finally {
      clearTimeout(timeout);
      if (activeRef.current?.controller === controller) activeRef.current = null;
    }
  }, [cancelActive]);

  /** After network reconnects: retry every 2 s up to 8 times. */
  const startReconnectRetry = useCallback(() => {
    retryCount.current = 0;

    const attempt = async () => {
      if (retryRef.current) clearTimeout(retryRef.current);
      const success = await ping();
      if (!success && retryCount.current < 8) {
        retryCount.current++;
        retryRef.current = setTimeout(attempt, 2_000);
      }
    };

    attempt();
  }, [ping]);

  useEffect(() => {
    const goOnline  = () => { setOnline(true); startReconnectRetry(); };
    const goOffline = () => { setOnline(false); cancelActive(); };

    window.addEventListener('online',  goOnline);
    window.addEventListener('offline', goOffline);

    ping();
    timerRef.current = setInterval(ping, 5_000);

    return () => {
      window.removeEventListener('online',  goOnline);
      window.removeEventListener('offline', goOffline);
      if (timerRef.current)  clearInterval(timerRef.current);
      if (retryRef.current)  clearTimeout(retryRef.current);
      cancelActive();
    };
  }, [ping, startReconnectRetry, cancelActive]);

  return online;
}

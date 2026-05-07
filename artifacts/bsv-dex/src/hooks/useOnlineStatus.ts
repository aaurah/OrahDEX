import { useState, useEffect } from 'react';
import { API_BASE } from '@/lib/api';

/* ── Module-level singleton — one timer no matter how many components subscribe ── */
let _online   = navigator.onLine;
let _timer: ReturnType<typeof setInterval> | null = null;
let _listeners = new Set<(v: boolean) => void>();

function notifyAll(v: boolean) {
  if (v === _online) return;
  _online = v;
  _listeners.forEach(fn => fn(v));
}

async function ping() {
  if (!navigator.onLine) { notifyAll(false); return; }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5_000);
    const res = await fetch(`${API_BASE}/ping`, { method: 'GET', cache: 'no-store', signal: ctrl.signal });
    clearTimeout(t);
    notifyAll(res.ok || res.status === 204);
  } catch {
    notifyAll(false);
  }
}

function startSingleton() {
  if (_timer !== null) return;
  ping();
  _timer = setInterval(ping, 15_000);

  window.addEventListener('online',  () => { notifyAll(true);  ping(); });
  window.addEventListener('offline', () => { notifyAll(false); });
}

/* ── Hook — subscribes to shared status, no duplicate timers ── */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(_online);

  useEffect(() => {
    startSingleton();
    setOnline(_online);
    _listeners.add(setOnline);
    return () => { _listeners.delete(setOnline); };
  }, []);

  return online;
}

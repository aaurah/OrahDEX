import { useState, useEffect } from 'react';
import { API_BASE } from '@/lib/api';

/* ── Module-level singleton — one adaptive timer, no matter how many components ── */
let _online        = navigator.onLine;
let _offlineStreak = 0;
let _retryAt       = 0;
let _started       = false;
let _timer: ReturnType<typeof setTimeout> | null = null;

const _statusListeners = new Set<(v: boolean) => void>();
const _retryListeners  = new Set<(retryAt: number) => void>();

const ONLINE_INTERVAL_MS = 30_000;
const OFFLINE_BASE_MS    =  5_000;
const OFFLINE_MAX_MS     = 30_000;

function offlineDelay(): number {
  return Math.min(OFFLINE_MAX_MS, OFFLINE_BASE_MS * Math.pow(1.5, _offlineStreak));
}

function notifyStatus(v: boolean) {
  if (v === _online) return;
  _online = v;
  if (!v) _offlineStreak++;
  else    _offlineStreak = 0;
  _statusListeners.forEach(fn => fn(v));
}

function scheduleNext() {
  if (_timer !== null) clearTimeout(_timer);
  const delay = _online ? ONLINE_INTERVAL_MS : offlineDelay();
  _retryAt = Date.now() + delay;
  _retryListeners.forEach(fn => fn(_retryAt));
  _timer = setTimeout(ping, delay);
}

async function ping() {
  _timer = null;
  if (!navigator.onLine) { notifyStatus(false); scheduleNext(); return; }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8_000);
    const res = await fetch(`${API_BASE}/health`, { method: 'GET', cache: 'no-store', signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) { notifyStatus(false); scheduleNext(); return; }
    const data = await res.json().catch(() => null);
    notifyStatus(data?.status === 'ok');
  } catch {
    notifyStatus(false);
  }
  scheduleNext();
}

function startSingleton() {
  if (_started) return;
  _started = true;
  ping();
  window.addEventListener('online',  () => { notifyStatus(true);  retryNow(); });
  window.addEventListener('offline', () => { notifyStatus(false); scheduleNext(); });
}

/** Immediately trigger a health check (e.g. from a "Retry now" button). */
export function retryNow() {
  if (_timer !== null) { clearTimeout(_timer); _timer = null; }
  ping();
}

/* ── useOnlineStatus — true when the API is reachable ── */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(_online);

  useEffect(() => {
    startSingleton();
    setOnline(_online);
    _statusListeners.add(setOnline);
    return () => { _statusListeners.delete(setOnline); };
  }, []);

  return online;
}

/* ── useRetryCountdown — seconds until next auto-ping (0 when pinging / online) ── */
export function useRetryCountdown(): number {
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    function onRetry(at: number) {
      setSecs(Math.max(0, Math.round((at - Date.now()) / 1_000)));
    }
    _retryListeners.add(onRetry);

    const tick = setInterval(() => {
      setSecs(Math.max(0, Math.round((_retryAt - Date.now()) / 1_000)));
    }, 1_000);

    return () => {
      _retryListeners.delete(onRetry);
      clearInterval(tick);
    };
  }, []);

  return secs;
}

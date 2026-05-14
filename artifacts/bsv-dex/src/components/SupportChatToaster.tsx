import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useNotificationStore } from "@/store/useNotificationStore";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const SEEN_KEY = "orahdex:admin:support_chat_seen_ids";

function loadSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.slice(-200) : []);
  } catch { return new Set(); }
}

function saveSeen(set: Set<string>) {
  try {
    const arr = Array.from(set).slice(-200);
    localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
  } catch {}
}

interface ChatMsg {
  id: string;
  channel: string;
  wallet: string;
  displayName: string;
  role: string;
  text: string;
  ts: number;
}

/**
 * Subscribes to the public support SSE stream while an admin is in the
 * /admin section, and surfaces new user messages as toasts + bumps the
 * unread badge so the SupportInbox tab lights up everywhere.
 */
export function SupportChatToaster() {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const { addNotification } = useNotificationStore();
  const seenRef = useRef<Set<string>>(loadSeen());
  const initRef = useRef(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!location.startsWith("/admin")) {
      esRef.current?.close();
      esRef.current = null;
      initRef.current = false;
      return;
    }
    if (esRef.current) return;

    const url = `${BASE}/api/chat/channels/support/stream`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);

        if (data.type === "backfill" && Array.isArray(data.messages)) {
          for (const m of data.messages as ChatMsg[]) seenRef.current.add(m.id);
          saveSeen(seenRef.current);
          initRef.current = true;
          return;
        }

        const m = data as ChatMsg;
        if (!m?.id || !m?.text) return;
        if (seenRef.current.has(m.id)) return;
        seenRef.current.add(m.id);
        saveSeen(seenRef.current);

        if (!initRef.current) return;
        if (m.role === "support" || m.role === "system") return;

        const preview = m.text.length > 90 ? m.text.slice(0, 90) + "…" : m.text;
        toast({
          title: `New support chat from ${m.displayName}`,
          description: preview,
        });
        addNotification({
          type: "support",
          title: `Live chat: ${m.displayName}`,
          body: preview,
          href: "/admin/support/inbox",
        });

        try {
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification(`Support chat — ${m.displayName}`, { body: preview });
          }
        } catch {}
      } catch {}
    };

    es.onerror = () => { /* EventSource auto-reconnects */ };

    return () => { es.close(); esRef.current = null; initRef.current = false; };
  }, [location, toast, addNotification, navigate]);

  useEffect(() => {
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
    } catch {}
  }, []);

  return null;
}

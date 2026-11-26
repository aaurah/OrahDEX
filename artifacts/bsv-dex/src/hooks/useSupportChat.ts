import { useCallback, useEffect, useMemo, useState } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const STORAGE_PREFIX = "orahdex_support_chat_v1:";

export interface SupportChatMessage {
  id: string;
  senderRole: "customer" | "support";
  senderName: string;
  text: string;
  createdAt: string;
}

interface SupportChatSession {
  id: string;
  accessToken: string;
}

interface SessionState {
  key: string;
  session: SupportChatSession | null;
}

function getStorageKey(wallet: string | null | undefined): string {
  const identity = wallet?.trim() || "anonymous";
  const normalized = identity.startsWith("0x") ? identity.toLowerCase() : identity;
  return `${STORAGE_PREFIX}${encodeURIComponent(normalized)}`;
}

function readSession(storageKey: string): SupportChatSession | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.id === "string" && typeof parsed?.accessToken === "string") {
      return { id: parsed.id, accessToken: parsed.accessToken };
    }
  } catch { /* local storage can be unavailable */ }
  return null;
}

async function responseError(response: Response, fallback: string): Promise<Error> {
  try {
    const data = await response.json();
    return new Error(typeof data?.error === "string" ? data.error : fallback);
  } catch {
    return new Error(fallback);
  }
}

export function useSupportChat(
  open: boolean,
  wallet: string | null | undefined,
  displayName: string,
) {
  const storageKey = useMemo(() => getStorageKey(wallet), [wallet]);
  const [sessionState, setSessionState] = useState<SessionState>(() => ({
    key: storageKey,
    session: readSession(storageKey),
  }));
  const session = sessionState.key === storageKey ? sessionState.session : null;
  const [messagesState, setMessagesState] = useState({ key: storageKey, messages: [] as SupportChatMessage[] });
  const messages = messagesState.key === storageKey ? messagesState.messages : [];
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setMessages = useCallback((next: SupportChatMessage[] | ((current: SupportChatMessage[]) => SupportChatMessage[])) => {
    setMessagesState(current => {
      const currentMessages = current.key === storageKey ? current.messages : [];
      return {
        key: storageKey,
        messages: typeof next === "function" ? next(currentMessages) : next,
      };
    });
  }, [storageKey]);

  useEffect(() => {
    setSessionState({ key: storageKey, session: readSession(storageKey) });
    setMessages([]);
    setError(null);
    setLoading(false);
  }, [storageKey, setMessages]);

  const saveSession = useCallback((next: SupportChatSession) => {
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* chat still works until reload */ }
    setSessionState({ key: storageKey, session: next });
    return next;
  }, [storageKey]);

  const loadMessages = useCallback(async (activeSession: SupportChatSession, quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch(`${BASE}/api/support/chats/${activeSession.id}/messages`, {
        headers: { Authorization: `Bearer ${activeSession.accessToken}` },
      });
      if (!response.ok) throw await responseError(response, "Could not load support messages.");
      const data = await response.json();
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      setError(null);
    } catch (err: any) {
      if (!quiet) setError(err?.message ?? "Could not load support messages.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [setMessages]);

  useEffect(() => {
    if (!open || !session) return;
    let active = true;
    let inFlight = false;
    const refresh = async () => {
      if (!active || inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      await loadMessages(session, true);
      inFlight = false;
    };
    void refresh();
    const timer = window.setInterval(refresh, 5_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [open, session, loadMessages]);

  const sendMessage = useCallback(async (rawText: string) => {
    const text = rawText.trim();
    if (!text || sending) return;
    if (text.length > 2_000) throw new Error("Messages can be up to 2,000 characters.");
    setSending(true);
    setError(null);
    try {
      let activeSession = session;
      if (!activeSession) {
        const createResponse = await fetch(`${BASE}/api/support/chats`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wallet: wallet || "anonymous", displayName }),
        });
        if (!createResponse.ok) throw await responseError(createResponse, "Could not start a support chat.");
        const created = await createResponse.json();
        activeSession = saveSession({
          id: created.conversation.id,
          accessToken: created.accessToken,
        });
      }

      const response = await fetch(`${BASE}/api/support/chats/${activeSession.id}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${activeSession.accessToken}`,
        },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) throw await responseError(response, "Could not send support message.");
      const data = await response.json();
      if (data.message) {
        setMessages(current => current.some(message => message.id === data.message.id)
          ? current
          : [...current, data.message]);
      }
      return data.message as SupportChatMessage | undefined;
    } catch (err: any) {
      const message = err?.message ?? "Could not send support message.";
      setError(message);
      throw new Error(message);
    } finally {
      setSending(false);
    }
  }, [displayName, saveSession, sending, session, setMessages, wallet]);

  const clearError = useCallback(() => setError(null), []);
  return { messages, loading, sending, error, sendMessage, clearError };
}

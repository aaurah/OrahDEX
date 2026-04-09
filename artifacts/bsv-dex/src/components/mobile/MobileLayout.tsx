import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { useLocation } from "wouter";
import { BarChart2, Briefcase, Settings, ArrowRightLeft, Layers, Users2, Sun, Moon, MonitorSmartphone, Circle, CreditCard, MessageCircle, Send, X, ChevronDown, Zap, QrCode, Cable } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { useWalletStore } from "@/store/useWalletStore";
import { WalletOptionsDropdown } from "@/components/WalletOptionsDropdown";
import { useThemeStore, type Theme } from "@/store/useThemeStore";
import { cn } from "@/lib/utils";

const WalletConnectModal = lazy(() => import("@/components/WalletConnectModal").then(m => ({ default: m.WalletConnectModal })));
const BuyCryptoModal     = lazy(() => import("@/components/BuyCryptoModal").then(m => ({ default: m.BuyCryptoModal })));

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface ChatMsg { role: "user" | "support"; text: string }

function MobileChatWidget({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: "support", text: "Hi! Welcome to OrahDEX Support 👋 How can I help you today?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput("");
    setMessages(m => [...m, { role: "user", text }]);
    setLoading(true);
    try {
      const convRes = await fetch(`${BASE}/api/ai/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Mobile Support" }),
      });
      const conv = await convRes.json();
      const msgRes = await fetch(`${BASE}/api/ai/conversations/${conv.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "user", content: text }),
      });
      const data = await msgRes.json();
      const reply = data?.reply ?? data?.content ?? "A support agent will follow up shortly.";
      setMessages(m => [...m, { role: "support", text: reply }]);
    } catch {
      setMessages(m => [...m, { role: "support", text: "We've received your message. A support agent will follow up within 24 hours." }]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/95 backdrop-blur shrink-0 pt-safe-top" style={{ paddingTop: "max(12px, env(safe-area-inset-top, 12px))" }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
            <MessageCircle className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-bold">OrahDEX Support</p>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <p className="text-[11px] text-green-400">Online · Ora AI</p>
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-secondary/60 text-muted-foreground active:bg-secondary"
        >
          <X size={18} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
            {msg.role === "support" && (
              <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center mr-2 shrink-0 mt-0.5">
                <MessageCircle className="w-3 h-3 text-primary" />
              </div>
            )}
            <div className={cn(
              "max-w-[78%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed",
              msg.role === "user"
                ? "bg-primary text-primary-foreground rounded-br-sm"
                : "bg-secondary text-foreground rounded-bl-sm"
            )}>
              {msg.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center mr-2 shrink-0 mt-0.5">
              <MessageCircle className="w-3 h-3 text-primary" />
            </div>
            <div className="bg-secondary rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm text-muted-foreground">
              <span className="animate-pulse">Typing…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 px-4 py-3 border-t border-border bg-card/80 backdrop-blur" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 12px))" }}>
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && send()}
            placeholder="Type your message..."
            className="flex-1 bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50"
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 active:scale-95 transition-transform shrink-0"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

const TABS = [
  { path: "/markets", label: "Markets", Icon: BarChart2, exact: true },
  { path: "/trade/BSV-USDT", label: "Trade", Icon: ArrowRightLeft },
  { path: "/dex", label: "Mkt Hub", Icon: Layers },
  { path: "/p2p", label: "P2P", Icon: Users2 },
  { path: "/bridge", label: "Bridge", Icon: Cable },
  { path: "/portfolio", label: "Portfolio", Icon: Briefcase },
  { path: "/settings", label: "Settings", Icon: Settings },
];

const THEME_CYCLE: Theme[] = ["dark", "light", "amoled", "system"];

const THEME_META: Record<Theme, { icon: React.ComponentType<{ size: number; className?: string }>; label: string }> = {
  dark:   { icon: Moon,              label: "Dark"   },
  light:  { icon: Sun,               label: "Light"  },
  amoled: { icon: Circle,            label: "AMOLED" },
  system: { icon: MonitorSmartphone, label: "System" },
};

export function MobileLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { isOpen: walletOpen, open: openWallet, close: closeWallet } = useWalletModalStore();
  const { address } = useWalletStore();
  const { theme, setTheme } = useThemeStore();
  const [buyOpen, setBuyOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    const handler = () => setChatOpen(true);
    window.addEventListener("mobile:openChat", handler);
    return () => window.removeEventListener("mobile:openChat", handler);
  }, []);

  const isActive = (tab: typeof TABS[0]) => {
    if (tab.exact) return location === tab.path;
    return location.startsWith(tab.path);
  };

  const cycleTheme = () => {
    const idx = THEME_CYCLE.indexOf(theme);
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    setTheme(next);
  };

  const { icon: ThemeIcon, label: themeLabel } = THEME_META[theme];

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">

      {/* ── Global brand header ── */}
      <div className="shrink-0 border-b border-border/40 z-50 bg-card/95 backdrop-blur-sm">
        <div className="flex items-center h-12">

          {/* Brand — hard left corner, no left padding */}
          <button
            onClick={() => navigate("/")}
            className="flex items-center h-full px-2 active:opacity-70 transition-opacity shrink-0"
          >
            <BrandLogo textSize="text-2xl" />
          </button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Theme toggle */}
          <button
            onClick={cycleTheme}
            title={`Theme: ${themeLabel}`}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-secondary/60 text-muted-foreground active:bg-secondary transition-colors shrink-0 mr-2"
          >
            <ThemeIcon size={18} className="text-foreground/80" />
          </button>

          {/* QR Scan button */}
          <button
            onClick={() => navigate("/qr-scan")}
            title="QR Scanner"
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-secondary/60 text-muted-foreground active:bg-secondary transition-colors shrink-0 mr-1.5"
          >
            <QrCode size={17} className="text-foreground/80" />
          </button>

          {/* Buy button */}
          <button
            onClick={() => setBuyOpen(true)}
            className="flex items-center gap-1 px-3 py-[6px] rounded-lg bg-green-500 text-white text-[12px] font-bold shadow-sm shadow-green-500/30 active:scale-95 transition-transform shrink-0 mr-2"
          >
            <CreditCard size={12} />
            Buy
          </button>

          {/* Wallet button */}
          <div className="shrink-0 pr-3">
            {address ? (
              <WalletOptionsDropdown compact />
            ) : (
              <button
                onClick={() => openWallet()}
                className="flex items-center gap-1.5 bg-gradient-to-r from-red-500 to-primary text-white px-3.5 py-[7px] rounded-lg text-[12px] font-semibold shadow-md shadow-primary/20 active:opacity-80 transition-opacity"
              >
                Connect
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Page content */}
      <div className="flex-1 overflow-y-auto overscroll-contain relative">
        {children}
      </div>

      {/* Bottom tab bar — 7 tabs */}
      <div className="shrink-0 flex items-stretch border-t border-border bg-background/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {TABS.map(tab => {
          const active = isActive(tab);
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors active:bg-white/5"
            >
              <tab.Icon
                size={18}
                className={active ? "text-primary" : "text-muted-foreground"}
                strokeWidth={active ? 2.5 : 1.5}
              />
              <span className={`text-[10px] font-medium ${active ? "text-primary font-bold" : "text-muted-foreground"}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      <Suspense fallback={null}>
        <WalletConnectModal isOpen={walletOpen} onClose={() => closeWallet()} />
      </Suspense>
      <Suspense fallback={null}>
        <BuyCryptoModal open={buyOpen} onClose={() => setBuyOpen(false)} defaultCoin="BSV" />
      </Suspense>
      {/* Floating chat button — bottom right */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          title="Live Support"
          className="fixed bottom-20 right-4 z-50 w-13 h-13 rounded-full shadow-2xl bg-gradient-to-br from-primary/90 to-primary flex items-center justify-center active:scale-95 transition-transform"
          style={{ width: 52, height: 52 }}
        >
          <MessageCircle size={22} className="text-white" />
        </button>
      )}
      <MobileChatWidget open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}

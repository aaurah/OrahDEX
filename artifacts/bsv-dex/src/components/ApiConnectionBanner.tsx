import { useEffect, useRef, useState } from "react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

/**
 * Thin status strip fixed to the top of the screen.
 *
 * - Offline  → amber "Connection lost — retrying…" bar with animated dots
 * - Restored → brief green "Connected" flash, then hides automatically
 * - Online   → invisible (zero height, no layout impact)
 */
export function ApiConnectionBanner() {
  const online = useOnlineStatus();
  const prevOnline = useRef(online);
  const [phase, setPhase] = useState<"hidden" | "offline" | "restored">("hidden");
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const wasOnline = prevOnline.current;
    prevOnline.current = online;

    if (!online) {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setPhase("offline");
      return;
    }

    if (!wasOnline && online) {
      setPhase("restored");
      hideTimer.current = setTimeout(() => setPhase("hidden"), 2_500);
    }

    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [online]);

  if (phase === "hidden") return null;

  return (
    <div
      aria-live="polite"
      className={[
        "fixed top-0 left-0 right-0 z-[9999]",
        "flex items-center justify-center gap-2",
        "text-xs font-medium py-1.5 px-4",
        "transition-all duration-300",
        phase === "offline"
          ? "bg-amber-500/90 text-amber-950 backdrop-blur-sm"
          : "bg-emerald-500/90 text-emerald-950 backdrop-blur-sm",
      ].join(" ")}
    >
      {phase === "offline" ? (
        <>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-950/60 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-950/80" />
          </span>
          Connection lost — retrying
          <AnimatedDots />
        </>
      ) : (
        <>
          <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Connected
        </>
      )}
    </div>
  );
}

function AnimatedDots() {
  return (
    <span className="inline-flex gap-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block w-0.5 h-0.5 rounded-full bg-current animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

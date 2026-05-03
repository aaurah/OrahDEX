import { useEffect, useState } from "react";
import { Monitor, BellOff, Filter, CheckCircle2, X } from "lucide-react";
import { useSettingsStore } from "@/store/useSettingsStore";
import { ALL_CATEGORIES, CATEGORY_META, type NotifCategory } from "@/lib/notificationCategories";
import {
  requestDesktopPermission,
  getDesktopPermission,
} from "@/lib/notificationFx";
import { cn } from "@/lib/utils";

interface RowProps {
  icon: any;
  label: string;
  value?: string;
  rightEl?: React.ReactNode;
  onClick?: () => void;
}

/** Renders the three advanced notification controls used in both Settings pages. */
export function NotificationAdvancedRows({ Row, Toggle }: {
  Row: React.ComponentType<RowProps>;
  Toggle: React.ComponentType<{ value: boolean; onChange: (v: boolean) => void }>;
}) {
  const desktopEnabled = useSettingsStore((s) => s.desktopEnabled);
  const setDesktopEnabled = useSettingsStore((s) => s.setDesktopEnabled);
  const dndUntil = useSettingsStore((s) => s.dndUntil);
  const setDndUntil = useSettingsStore((s) => s.setDndUntil);
  const muted = useSettingsStore((s) => s.mutedCategories);
  const setMuted = useSettingsStore((s) => s.setMutedCategories);

  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  const [showCategories, setShowCategories] = useState(false);

  useEffect(() => { setPerm(getDesktopPermission()); }, []);

  const dndActive = dndUntil !== null && Date.now() < dndUntil;
  const dndLabel = !dndActive
    ? "Off"
    : (dndUntil! >= Number.MAX_SAFE_INTEGER
        ? "Until I turn it off"
        : `Until ${new Date(dndUntil!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);

  const onToggleDesktop = async (v: boolean) => {
    if (!v) { setDesktopEnabled(false); return; }
    if (perm === "unsupported") return;
    if (perm !== "granted") {
      const result = await requestDesktopPermission();
      setPerm(result === "unsupported" ? "unsupported" : result);
      if (result !== "granted") return;
    }
    setDesktopEnabled(true);
  };

  const toggleCategory = (cat: NotifCategory) => {
    if (muted.includes(cat)) setMuted(muted.filter((c) => c !== cat));
    else setMuted([...muted, cat]);
  };

  return (
    <>
      {/* Desktop notifications */}
      <Row
        icon={Monitor}
        label="Desktop Notifications"
        value={
          perm === "unsupported" ? "Not supported in this browser"
          : perm === "denied"     ? "Blocked — enable in browser settings"
          : desktopEnabled        ? "Show OS notifications when tab is in background"
          : "Off"
        }
        rightEl={
          <Toggle
            value={desktopEnabled && perm === "granted"}
            onChange={(v) => { void onToggleDesktop(v); }}
          />
        }
      />

      {/* Do Not Disturb */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/40">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <BellOff className={cn("w-4 h-4", dndActive ? "text-amber-400" : "text-muted-foreground")} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">Do Not Disturb</p>
            <p className="text-[11px] text-muted-foreground truncate">{dndLabel}</p>
          </div>
        </div>
      </div>
      <div className="px-4 pb-3 -mt-1 border-b border-border/40 flex flex-wrap gap-1.5">
        {[
          { label: "15m",     ms: 15 * 60 * 1000 },
          { label: "1 hour",  ms: 60 * 60 * 1000 },
          { label: "8 hours", ms: 8 * 60 * 60 * 1000 },
          { label: "Until off", ms: -1 },
        ].map((opt) => (
          <button
            key={opt.label}
            onClick={() => setDndUntil(opt.ms < 0 ? Number.MAX_SAFE_INTEGER : Date.now() + opt.ms)}
            className="px-2.5 py-1 text-[11px] rounded-md bg-muted/60 hover:bg-amber-500/10 hover:text-amber-400 text-muted-foreground transition-colors"
          >
            {opt.label}
          </button>
        ))}
        {dndActive && (
          <button
            onClick={() => setDndUntil(null)}
            className="px-2.5 py-1 text-[11px] rounded-md bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Resume
          </button>
        )}
      </div>

      {/* Per-category mute */}
      <Row
        icon={Filter}
        label="Mute Categories"
        value={muted.length === 0 ? "All categories enabled" : `${muted.length} category(ies) muted`}
        onClick={() => setShowCategories((v) => !v)}
      />
      {showCategories && (
        <div className="px-4 pb-3 -mt-1 border-b border-border/40 space-y-1">
          {ALL_CATEGORIES.map((cat) => {
            const isMuted = muted.includes(cat);
            return (
              <button
                key={cat}
                onClick={() => toggleCategory(cat)}
                className={cn(
                  "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left transition-colors",
                  isMuted ? "bg-muted/40 opacity-60" : "bg-primary/5 hover:bg-primary/10",
                )}
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground">{CATEGORY_META[cat].label}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{CATEGORY_META[cat].description}</p>
                </div>
                {isMuted
                  ? <BellOff className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  : <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

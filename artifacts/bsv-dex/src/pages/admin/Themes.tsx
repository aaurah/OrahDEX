import { useThemeStore, type Theme } from "@/store/useThemeStore";
import { Monitor, Sun, Smartphone, Check, Palette } from "lucide-react";
import { cn } from "@/lib/utils";

const THEMES: {
  id: Theme;
  label: string;
  subtitle: string;
  icon: any;
  preview: { bg: string; card: string; text: string; accent: string; border: string };
}[] = [
  {
    id: "dark",
    label: "Dark",
    subtitle: "Professional dark exchange theme",
    icon: Monitor,
    preview: {
      bg: "bg-[#0b0e11]",
      card: "bg-[#181a20]",
      text: "text-[#eaecef]",
      accent: "bg-[#fcd535]",
      border: "border-[#2b3139]",
    },
  },
  {
    id: "light",
    label: "Light",
    subtitle: "Clean light mode for well-lit environments",
    icon: Sun,
    preview: {
      bg: "bg-[#f5f7fa]",
      card: "bg-white",
      text: "text-[#1a1d22]",
      accent: "bg-[#d4a400]",
      border: "border-[#e0e3e9]",
    },
  },
  {
    id: "amoled",
    label: "AMOLED",
    subtitle: "True black for OLED/AMOLED displays — saves battery",
    icon: Smartphone,
    preview: {
      bg: "bg-black",
      card: "bg-[#0a0a0a]",
      text: "text-[#ebebeb]",
      accent: "bg-[#ffd700]",
      border: "border-[#1a1a1a]",
    },
  },
];

function ThemePreview({ theme }: { theme: typeof THEMES[0] }) {
  const p = theme.preview;
  return (
    <div className={cn("rounded-xl overflow-hidden border-2 w-full aspect-video", p.bg, p.border)}>
      {/* Mock nav */}
      <div className={cn("h-6 flex items-center gap-1.5 px-2 border-b", p.card, p.border)}>
        <div className={cn("w-10 h-2 rounded-full", p.accent)} />
        <div className="flex gap-1 ml-auto">
          {[1,2,3].map(i => <div key={i} className="w-6 h-1.5 rounded bg-current opacity-20" />)}
        </div>
      </div>
      {/* Mock content */}
      <div className={cn("flex h-full", p.bg)}>
        {/* Sidebar */}
        <div className={cn("w-10 h-full border-r", p.card, p.border)} />
        {/* Main */}
        <div className="flex-1 p-2 space-y-1.5">
          <div className="flex gap-1.5">
            {[60,40,50].map((w,i) => (
              <div key={i} className={cn("h-4 rounded", p.card)} style={{ width: `${w}%` }} />
            ))}
          </div>
          <div className={cn("rounded h-12 w-full", p.card)}>
            <div className="flex h-full">
              {/* Chart bars */}
              {[4,6,3,8,5,7,4,9,6,5,8,6].map((h,i) => (
                <div key={i} className="flex-1 flex items-end justify-center px-px">
                  <div className={cn("w-full rounded-t", i % 3 === 0 ? "bg-red-400/60" : "bg-green-400/60")} style={{height: `${h * 10}%`}} />
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-1.5">
            <div className={cn("h-6 rounded flex-1", p.card)} />
            <div className={cn("h-6 rounded w-12", p.accent)} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminThemes() {
  const { theme, setTheme } = useThemeStore();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Theme Settings</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Choose your preferred visual theme for Orah DEX</p>
      </div>

      {/* Theme Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {THEMES.map((t) => {
          const active = theme === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className={cn(
                "relative text-left rounded-2xl border-2 p-4 transition-all hover:scale-[1.01] active:scale-[0.99] space-y-3",
                active ? "border-primary shadow-lg shadow-primary/20" : "border-border hover:border-primary/40"
              )}
            >
              {/* Active badge */}
              {active && (
                <div className="absolute top-3 right-3 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                  <Check className="w-3.5 h-3.5 text-primary-foreground" />
                </div>
              )}

              {/* Preview */}
              <ThemePreview theme={t} />

              {/* Label */}
              <div className="flex items-center gap-2.5">
                <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center",
                  active ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"
                )}>
                  <t.icon className="w-4.5 h-4.5" />
                </div>
                <div>
                  <div className="font-bold text-foreground">{t.label}</div>
                  <div className="text-xs text-muted-foreground">{t.subtitle}</div>
                </div>
              </div>

              {active && (
                <div className="text-xs text-primary font-semibold">✦ Currently active</div>
              )}
            </button>
          );
        })}
      </div>

      {/* Additional UI preferences */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <h3 className="font-semibold mb-4 flex items-center gap-2"><Palette className="w-4 h-4 text-primary" /> Additional Preferences</h3>
        <div className="space-y-3">
          {[
            { label: "Compact Order Book", desc: "Reduce row height in order book for more data density" },
            { label: "Animate Price Changes", desc: "Flash green/red on price updates" },
            { label: "Show TradingView Watermark", desc: "Display chart attribution logo" },
            { label: "High Contrast Prices", desc: "Use stronger green/red contrast for bid/ask" },
          ].map((pref, i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-secondary/40 rounded-xl border border-border">
              <div>
                <p className="text-sm font-medium">{pref.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{pref.desc}</p>
              </div>
              <button
                className={cn(
                  "w-11 h-6 rounded-full border transition-all relative",
                  i % 2 === 0 ? "bg-primary border-primary" : "bg-secondary border-border"
                )}
              >
                <div className={cn("absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all",
                  i % 2 === 0 ? "left-5" : "left-0.5"
                )} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

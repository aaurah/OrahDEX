import { X, Globe, FileText, ExternalLink, Info } from "lucide-react";
import { CoinLogo } from "@/components/CoinLogo";
import { getCoinInfo, getTagColor } from "@/lib/coinInfo";
import { cn } from "@/lib/utils";

interface Props {
  symbol: string | null;
  onClose: () => void;
}

export function CoinInfoSheet({ symbol, onClose }: Props) {
  if (!symbol) return null;
  const info = getCoinInfo(symbol);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-card border-t border-border rounded-t-2xl shadow-2xl animate-in slide-in-from-bottom max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="sticky top-0 z-10 bg-card pt-2 pb-1 px-4 flex justify-center">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-4 pt-2 pb-3">
          <div className="flex items-center gap-3 min-w-0">
            <CoinLogo symbol={symbol} size={48} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-lg font-bold text-foreground">
                  {info?.name ?? symbol}
                </span>
                <span className="text-sm font-mono text-muted-foreground">{symbol}</span>
              </div>
              {info?.tags && info.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {info.tags.map((tag) => (
                    <span
                      key={tag}
                      className={cn(
                        "text-[10px] font-semibold px-1.5 py-0.5 rounded border leading-none",
                        getTagColor(tag),
                      )}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-1.5 rounded-lg hover:bg-white/10 transition"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 pb-6 space-y-4">
          {info?.description ? (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                <Info className="w-3 h-3" /> About {info.name}
              </p>
              <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">
                {info.description}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-muted/20 p-4 text-center">
              <Info className="w-5 h-5 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                No detailed description available for{" "}
                <span className="font-semibold text-foreground">{symbol}</span> yet.
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Detailed metadata is being imported from CoinGecko.
              </p>
            </div>
          )}

          {/* Links */}
          {(info?.website || info?.whitepaper) && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                Resources
              </p>
              <div className="space-y-1.5">
                {info.website && (
                  <a
                    href={info.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-2 p-3 rounded-xl bg-secondary/40 hover:bg-secondary/60 border border-border transition"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Globe className="w-4 h-4 shrink-0 text-primary" />
                      <span className="text-sm text-foreground truncate">
                        {info.website.replace(/^https?:\/\//, "")}
                      </span>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  </a>
                )}
                {info.whitepaper && (
                  <a
                    href={info.whitepaper}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-2 p-3 rounded-xl bg-secondary/40 hover:bg-secondary/60 border border-border transition"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 shrink-0 text-primary" />
                      <span className="text-sm text-foreground truncate">
                        Whitepaper
                      </span>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  </a>
                )}
              </div>
            </div>
          )}

          {/* External research links */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              Market data
            </p>
            <div className="space-y-1.5">
              <a
                href={`https://www.coingecko.com/en/coins/${symbol.toLowerCase()}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-2 p-3 rounded-xl bg-secondary/40 hover:bg-secondary/60 border border-border transition"
              >
                <span className="text-sm text-foreground">View on CoinGecko</span>
                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
              </a>
              <a
                href={`https://coinmarketcap.com/currencies/${symbol.toLowerCase()}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-2 p-3 rounded-xl bg-secondary/40 hover:bg-secondary/60 border border-border transition"
              >
                <span className="text-sm text-foreground">View on CoinMarketCap</span>
                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useOnlineStatus } from '@/hooks/useOnlineStatus';

interface Props {
  textSize?: string;
  tooltip?: boolean;
}

export function BrandLogo({ textSize = 'text-xl', tooltip = true }: Props) {
  const online = useOnlineStatus();

  return (
    <span
      className={`inline-flex items-center font-bold tracking-tight text-foreground leading-none ${textSize}`}
      title={tooltip ? (online ? 'Connected to internet' : 'No internet connection') : undefined}
    >
      <OrahO online={online} />
      <span>rah</span>
      <span className="text-green-400">DEX</span>
    </span>
  );
}

/** Inline branded "OrahDEX" — shares the same online state to avoid duplicate timers */
export function OrahInline({ className = "" }: { className?: string }) {
  const online = useOnlineStatus();
  return (
    <span className={`inline-flex items-center font-bold tracking-tight leading-none align-middle ${className}`}>
      <OrahO online={online} />
      <span>rah</span>
      <span className="text-green-400">DEX</span>
    </span>
  );
}

/** Just the animated O glyph — reused by both exports */
export function OrahO({ online }: { online: boolean }) {
  const color = online ? '#4ade80' : '#ef4444';
  const glowColor = online ? 'rgba(74,222,128,0.8)' : 'rgba(239,68,68,0.8)';
  return (
    <svg
      viewBox="0 0 100 100"
      className="inline-block h-[1em] w-[1em] overflow-visible shrink-0"
      fill="none"
      aria-hidden
    >
      <circle cx="50" cy="50" r="40" stroke="currentColor" strokeWidth="12" fill="none" />
      <circle cx="50" cy="50" r="13" fill={color} opacity="0.7"
        style={{ filter: `blur(2px) drop-shadow(0 0 6px ${glowColor})` }}>
        <animate attributeName="r"       from="13" to="34" dur="1.2s" repeatCount="indefinite" />
        <animate attributeName="opacity" from="0.7" to="0"  dur="1.2s" repeatCount="indefinite" />
      </circle>
      <circle cx="50" cy="50" r="13" fill={color}
        style={{ filter: `drop-shadow(0 0 5px ${glowColor}) drop-shadow(0 0 2px ${glowColor})` }} />
    </svg>
  );
}

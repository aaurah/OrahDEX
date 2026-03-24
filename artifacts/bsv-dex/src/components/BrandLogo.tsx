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

/** Inline branded "OrahDEX" — scales with surrounding text size */
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
function OrahO({ online }: { online: boolean }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className="inline-block h-[1em] w-[1em] overflow-visible shrink-0"
      fill="none"
      aria-hidden
    >
      <circle cx="50" cy="50" r="40" stroke="currentColor" strokeWidth="16" fill="none" />
      <circle cx="50" cy="50" r="13" fill={online ? 'var(--color-primary)' : '#ef4444'} opacity="0.7">
        <animate attributeName="r"       from="13" to="34" dur="1.2s" repeatCount="indefinite" />
        <animate attributeName="opacity" from="0.7" to="0"  dur="1.2s" repeatCount="indefinite" />
      </circle>
      <circle cx="50" cy="50" r="13" fill={online ? 'var(--color-primary)' : '#ef4444'} />
    </svg>
  );
}

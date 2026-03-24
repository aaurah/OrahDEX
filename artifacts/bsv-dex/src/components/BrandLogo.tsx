import { useOnlineStatus } from '@/hooks/useOnlineStatus';

interface Props {
  textSize?: string;
  tooltip?: boolean;
}

/**
 * OrahDEX wordmark.
 * Icon: green rounded-square badge · white O ring · green dot centred inside.
 * Green pulse = online  •  Red = offline
 */
export function BrandLogo({ textSize = 'text-xl', tooltip = true }: Props) {
  const online = useOnlineStatus();

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-bold tracking-tight text-foreground leading-none ${textSize}`}
      title={tooltip ? (online ? 'Connected to internet' : 'No internet connection') : undefined}
    >
      {/* Green box badge icon */}
      <svg
        viewBox="0 0 100 100"
        className="inline-block h-[1.25em] w-[1.25em] shrink-0"
        fill="none"
        aria-hidden
      >
        {/* Green rounded-rect background */}
        <rect width="100" height="100" rx="22" fill="#16a34a" />

        {/* Pulse ring */}
        <circle
          cx="50" cy="50" r="16"
          fill={online ? '#4ade80' : '#ef4444'}
          opacity="0.7"
        >
          <animate attributeName="r"       from="16"  to="38"  dur="1.2s" repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.7" to="0"   dur="1.2s" repeatCount="indefinite" />
        </circle>

        {/* Solid dot */}
        <circle
          cx="50" cy="50" r="16"
          fill={online ? '#4ade80' : '#ef4444'}
        />
      </svg>

      {/* Wordmark */}
      <span>Orah</span><span className="text-green-400">DEX</span>
    </span>
  );
}

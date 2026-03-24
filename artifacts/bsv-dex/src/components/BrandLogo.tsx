import { useOnlineStatus } from '@/hooks/useOnlineStatus';

interface Props {
  textSize?: string;
  tooltip?: boolean;
}

/**
 * OrahDEX wordmark.
 * The "O" is an SVG ring — dot is mathematically centred at the same cx/cy.
 * Green pulse = connected  •  Red = disconnected
 */
export function BrandLogo({ textSize = 'text-xl', tooltip = true }: Props) {
  const online = useOnlineStatus();

  return (
    <span
      className={`inline-flex items-center font-bold tracking-tight text-foreground leading-none ${textSize}`}
      title={tooltip ? (online ? 'Connected to internet' : 'No internet connection') : undefined}
    >
      {/*
        SVG "O": outer ring drawn with stroke, dot drawn at exact cx/cy centre.
        viewBox is square; height matches 1em via className; width auto.
      */}
      <svg
        viewBox="0 0 100 100"
        className="inline-block h-[1em] w-[1em] overflow-visible shrink-0"
        fill="none"
        aria-hidden
      >
        {/* O ring — stroke colour matches the surrounding text */}
        <circle
          cx="50" cy="50" r="40"
          stroke="currentColor"
          strokeWidth="16"
          fill="none"
        />

        {/* Ping animation circle (online only) */}
        {online && (
          <circle cx="50" cy="50" r="9" fill="#4ade80" opacity="0.7">
            <animate
              attributeName="r"
              from="9" to="20"
              dur="1.2s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              from="0.7" to="0"
              dur="1.2s"
              repeatCount="indefinite"
            />
          </circle>
        )}

        {/* Solid dot — perfectly centred */}
        <circle
          cx="50" cy="50" r="9"
          fill={online ? '#4ade80' : '#ef4444'}
        />
      </svg>

      {/* Rest of wordmark */}
      <span>rah</span>
      <span className="text-green-400">DEX</span>
    </span>
  );
}

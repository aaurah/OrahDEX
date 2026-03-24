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
      {/* O = ring drawn with stroke, green dot centred inside */}
      <svg
        viewBox="0 0 100 100"
        className="inline-block h-[1em] w-[1em] overflow-visible shrink-0"
        fill="none"
        aria-hidden
      >
        {/* The O ring — matches surrounding text colour */}
        <circle cx="50" cy="50" r="40" stroke="currentColor" strokeWidth="16" fill="none" />

        {/* Pulse ring */}
        <circle cx="50" cy="50" r="13" fill={online ? 'var(--color-primary)' : '#ef4444'} opacity="0.7">
          <animate attributeName="r"       from="13" to="34" dur="1.2s" repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.7" to="0"  dur="1.2s" repeatCount="indefinite" />
        </circle>

        {/* Solid green dot */}
        <circle cx="50" cy="50" r="13" fill={online ? 'var(--color-primary)' : '#ef4444'} />
      </svg>

      <span>rah</span>
      <span className="text-green-400">DEX</span>
    </span>
  );
}

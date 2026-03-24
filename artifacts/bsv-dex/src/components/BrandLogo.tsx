import { useOnlineStatus } from '@/hooks/useOnlineStatus';

interface Props {
  /** Text size class, e.g. "text-xl" or "text-base" */
  textSize?: string;
  /** Show a tooltip on hover */
  tooltip?: boolean;
}

/**
 * OrahDEX wordmark with the connectivity status dot
 * positioned inside the hollow of the "O" letter.
 *
 *  Green pulse ring = connected
 *  Red solid dot   = disconnected
 */
export function BrandLogo({ textSize = 'text-xl', tooltip = true }: Props) {
  const online = useOnlineStatus();

  return (
    <span className={`inline-flex items-baseline font-bold tracking-tight text-foreground ${textSize}`}>
      {/* The "O" with dot floating inside it */}
      <span
        className="relative inline-flex items-center justify-center"
        title={tooltip ? (online ? 'Connected to internet' : 'No internet connection') : undefined}
      >
        O
        {/* Dot centered inside the O hollow */}
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="relative flex items-center justify-center w-[5px] h-[5px]">
            {online && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-70" />
            )}
            <span
              className={`relative rounded-full w-[5px] h-[5px] ${
                online ? 'bg-green-400' : 'bg-red-500'
              }`}
            />
          </span>
        </span>
      </span>

      {/* Rest of wordmark */}
      rah<span className="text-green-400">DEX</span>
    </span>
  );
}

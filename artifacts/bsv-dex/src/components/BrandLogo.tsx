import { useOnlineStatus } from '@/hooks/useOnlineStatus';

interface Props {
  textSize?: string;
  tooltip?: boolean;
}

/**
 * OrahDEX wordmark with connectivity dot perfectly centred
 * inside the hollow of the "O" glyph.
 *
 *  Green pulse = connected   •   Red = disconnected
 */
export function BrandLogo({ textSize = 'text-xl', tooltip = true }: Props) {
  const online = useOnlineStatus();

  return (
    <span className={`inline-flex items-center font-bold tracking-tight text-foreground leading-none ${textSize}`}>
      {/* O with dot inside */}
      <span
        className="relative inline-block leading-none"
        title={tooltip ? (online ? 'Connected to internet' : 'No internet connection') : undefined}
      >
        {/* The letter */}
        <span className="leading-none select-none">O</span>

        {/* Dot — absolutely centred over the glyph using translate trick */}
        <span
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          aria-hidden
        >
          <span className="relative flex items-center justify-center w-[5px] h-[5px]">
            {online && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-70" />
            )}
            <span
              className={`relative inline-flex rounded-full w-[5px] h-[5px] ${
                online ? 'bg-green-400' : 'bg-red-500'
              }`}
            />
          </span>
        </span>
      </span>

      {/* Rest of name */}
      <span>rah</span>
      <span className="text-green-400">DEX</span>
    </span>
  );
}

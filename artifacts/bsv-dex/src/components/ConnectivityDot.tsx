import { useOnlineStatus } from '@/hooks/useOnlineStatus';

interface Props {
  size?: 'sm' | 'md';
}

/**
 * A small dot next to the Orah logo:
 *  • Green + pulsing ring  → internet connected
 *  • Red (no ring)         → internet disconnected
 */
export function ConnectivityDot({ size = 'sm' }: Props) {
  const online = useOnlineStatus();

  const dotSize  = size === 'md' ? 'w-2.5 h-2.5' : 'w-2 h-2';
  const ringSize = size === 'md' ? 'w-2.5 h-2.5' : 'w-2 h-2';

  return (
    <span
      className="relative inline-flex items-center justify-center shrink-0"
      title={online ? 'Connected to internet' : 'No internet connection'}
      style={{ width: size === 'md' ? 10 : 8, height: size === 'md' ? 10 : 8 }}
    >
      {/* Ping ring — only shown when online */}
      {online && (
        <span
          className={`animate-ping absolute inline-flex ${ringSize} rounded-full bg-green-400 opacity-60`}
        />
      )}
      {/* Solid dot */}
      <span
        className={`relative inline-flex ${dotSize} rounded-full ${
          online ? 'bg-green-400' : 'bg-red-500'
        }`}
      />
    </span>
  );
}

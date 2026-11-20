export function withWalletRequestTimeout<T>(
  request: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
  onTimeout?: () => void,
): Promise<T>;

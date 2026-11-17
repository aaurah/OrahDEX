export function withWalletRequestTimeout<T>(
  request: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T>;

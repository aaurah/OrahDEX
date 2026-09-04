import { useCallback, useRef, useState } from "react";

export interface AutoRetryOptions {
  /** Maximum number of attempts (including the first). Default: 4 */
  maxAttempts?: number;
  /** Base delay in ms for exponential back-off. Default: 1000 */
  baseDelayMs?: number;
  /** Maximum delay cap in ms. Default: 30_000 */
  maxDelayMs?: number;
  /** Called after each failed attempt (before the next retry). */
  onRetry?: (attempt: number, error: unknown) => void;
}

export interface AutoRetryState<T> {
  data: T | null;
  error: unknown;
  isLoading: boolean;
  attempt: number;
  execute: () => Promise<T | null>;
  reset: () => void;
}

/**
 * Wraps any async function with exponential back-off retry logic.
 *
 * Unlike react-query this is for one-shot operations (order submission,
 * swap execution, etc.) that aren't cache-backed.
 *
 * @example
 * const { execute, isLoading, error } = useAutoRetry(
 *   () => fetch("/api/orders", { method: "POST", body: JSON.stringify(order) }),
 *   { maxAttempts: 3 }
 * );
 */
export function useAutoRetry<T>(
  fn: () => Promise<T>,
  options: AutoRetryOptions = {},
): AutoRetryState<T> {
  const {
    maxAttempts = 4,
    baseDelayMs  = 1_000,
    maxDelayMs   = 30_000,
    onRetry,
  } = options;

  const [state, setState] = useState<{
    data: T | null;
    error: unknown;
    isLoading: boolean;
    attempt: number;
  }>({ data: null, error: null, isLoading: false, attempt: 0 });

  const abortRef = useRef(false);

  const execute = useCallback(async (): Promise<T | null> => {
    abortRef.current = false;
    setState({ data: null, error: null, isLoading: true, attempt: 0 });

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (abortRef.current) return null;

      try {
        const result = await fn();
        setState({ data: result, error: null, isLoading: false, attempt });
        return result;
      } catch (err) {
        // Don't retry 4xx client errors — they won't self-heal
        const status = (err as { status?: number })?.status;
        const isClientError = status !== undefined && status >= 400 && status < 500;

        if (isClientError || attempt >= maxAttempts) {
          setState({ data: null, error: err, isLoading: false, attempt });
          return null;
        }

        onRetry?.(attempt, err);

        // Exponential back-off with jitter
        const delay = Math.min(baseDelayMs * 2 ** (attempt - 1) + Math.random() * 500, maxDelayMs);
        setState(s => ({ ...s, attempt, error: err }));
        await new Promise<void>(res => setTimeout(res, delay));
      }
    }
    return null;
  }, [fn, maxAttempts, baseDelayMs, maxDelayMs, onRetry]);

  const reset = useCallback(() => {
    abortRef.current = true;
    setState({ data: null, error: null, isLoading: false, attempt: 0 });
  }, []);

  return { ...state, execute, reset };
}

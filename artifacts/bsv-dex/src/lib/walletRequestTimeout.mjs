/**
 * Bound a wallet prompt wait and let the user stop waiting locally.
 * The underlying wallet request cannot be canceled by EIP-1193, but a late
 * signature cannot continue the order flow after this promise has rejected.
 *
 * @template T
 * @param {Promise<T>} request
 * @param {number} timeoutMs
 * @param {AbortSignal} [signal]
 * @returns {Promise<T>}
 */
export async function withWalletRequestTimeout(request, timeoutMs, signal) {
  let timeoutId;
  let abortListener;
  const abortPromise = signal
    ? new Promise((_, reject) => {
        const abort = () => {
          const error = new Error("Wallet signing was stopped. No order was submitted.");
          error.name = "AbortError";
          reject(error);
        };
        if (signal.aborted) {
          abort();
        } else {
          abortListener = abort;
          signal.addEventListener("abort", abort, { once: true });
        }
      })
    : new Promise(() => {});

  try {
    return await Promise.race([
      request,
      abortPromise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("Wallet did not respond. No order was submitted; reconnect the wallet and try again.")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (signal && abortListener) signal.removeEventListener("abort", abortListener);
  }
}

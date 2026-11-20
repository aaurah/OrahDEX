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
  return await new Promise((resolve, reject) => {
    let timeoutId;
    let timeoutStartedAt;
    let remainingMs = timeoutMs;
    let settled = false;
    let abortListener;
    const hasDocument = typeof document !== "undefined";

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = undefined;
      if (signal && abortListener) signal.removeEventListener("abort", abortListener);
      if (hasDocument) document.removeEventListener("visibilitychange", onVisibilityChange);
      if (typeof window !== "undefined") {
        window.removeEventListener("blur", pauseTimeout);
        window.removeEventListener("focus", resumeTimeout);
        window.removeEventListener("pagehide", pauseTimeout);
        window.removeEventListener("pageshow", resumeTimeout);
      }
    };
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const timeoutError = () => new Error(
      "Wallet did not respond. No order was submitted. Check the wallet for a pending signature before retrying.",
    );
    const onTimeout = () => finish(reject, timeoutError());
    const pauseTimeout = () => {
      if (!timeoutId) return;
      clearTimeout(timeoutId);
      timeoutId = undefined;
      remainingMs = Math.max(0, remainingMs - (Date.now() - timeoutStartedAt));
      timeoutStartedAt = undefined;
    };
    const resumeTimeout = () => {
      if (settled || timeoutId || (hasDocument && document.hidden)) return;
      if (remainingMs <= 0) {
        onTimeout();
        return;
      }
      timeoutStartedAt = Date.now();
      timeoutId = setTimeout(onTimeout, remainingMs);
    };
    const onVisibilityChange = () => {
      if (document.hidden) pauseTimeout();
      else resumeTimeout();
    };
    const abort = () => {
      const error = new Error("Wallet signing was stopped. No order was submitted.");
      error.name = "AbortError";
      finish(reject, error);
    };

    Promise.resolve(request).then(
      (value) => finish(resolve, value),
      (error) => finish(reject, error),
    );
    if (signal) {
      if (signal.aborted) {
        abort();
        return;
      }
      abortListener = abort;
      signal.addEventListener("abort", abort, { once: true });
    }
    if (hasDocument) document.addEventListener("visibilitychange", onVisibilityChange);
    if (typeof window !== "undefined") {
      window.addEventListener("blur", pauseTimeout);
      window.addEventListener("focus", resumeTimeout);
      window.addEventListener("pagehide", pauseTimeout);
      window.addEventListener("pageshow", resumeTimeout);
    }

    // External wallet handoffs background the browser. Pause the timeout while
    // the user reviews and approves the signature, then resume on return.
    resumeTimeout();
  });
}

// Transparent one-shot retry for idempotent (GET/HEAD) requests.
// Cold-start network failures (tunnel/QUIC/venue TLS warm-up) recover
// on their own within seconds; retry once instead of showing an error.
const rawFetch = window.fetch.bind(window);

window.fetch = (async (input: any, init?: any) => {
  const method = String(
    init?.method || (typeof input === "object" && input?.method) || "GET"
  ).toUpperCase();
  try {
    return await rawFetch(input, init);
  } catch (e) {
    if (method !== "GET" && method !== "HEAD") throw e;
    await new Promise((r) => setTimeout(r, 2000));
    // retry without the original (possibly aborted) signal
    const { signal: _s, ...rest } = init || {};
    return rawFetch(input, rest);
  }
}) as typeof fetch;

export {};

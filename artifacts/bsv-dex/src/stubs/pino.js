const LEVELS = {
  values: { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60, silent: Infinity },
  labels: { 10: "trace", 20: "debug", 30: "info", 40: "warn", 50: "error", 60: "fatal" },
};

function makeLogger(opts, storedBindings) {
  opts = opts || {};
  storedBindings = storedBindings || {};
  const write = opts.browser && opts.browser.write;
  return {
    level: opts.level || "info",
    levels: LEVELS,
    pino: "7.11.0",
    bindings() { return Object.assign({}, storedBindings); },
    child(b) { return makeLogger(opts, Object.assign({}, storedBindings, b)); },
    isLevelEnabled() { return false; },
    flush(cb) { if (cb) cb(); },
    trace() {},
    debug() {},
    silent() {},
    info(...a) {
      if (write) write(JSON.stringify({ level: 30, ...storedBindings, ...(typeof a[0] === "object" ? a[0] : {}), msg: typeof a[0] === "string" ? a[0] : (a[1] || ""), time: Date.now() }));
    },
    warn(...a) {
      console.warn("[WC]", ...a);
      if (write) write(JSON.stringify({ level: 40, ...storedBindings, msg: typeof a[0] === "string" ? a[0] : (a[1] || ""), time: Date.now() }));
    },
    error(...a) {
      console.error("[WC]", ...a);
      if (write) write(JSON.stringify({ level: 50, ...storedBindings, msg: typeof a[0] === "string" ? a[0] : (a[1] || ""), time: Date.now() }));
    },
    fatal(...a) { console.error("[WC fatal]", ...a); },
  };
}

const pino = function (opts) { return makeLogger(opts); };
pino.levels = LEVELS;
pino.version = "7.11.0";

export default pino;
export const levels = LEVELS;

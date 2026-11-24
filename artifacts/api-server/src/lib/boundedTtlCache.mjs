/**
 * A small LRU cache with a hard entry limit and per-entry expiration.
 * Expired values are removed on read and during periodic write sweeps; capacity
 * remains bounded even when clients continuously request unique keys.
 */
export class BoundedTtlCache {
  /** @param {number} maxEntries @param {number} ttlMs */
  constructor(maxEntries, ttlMs) {
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) {
      throw new Error("maxEntries must be a positive safe integer");
    }
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new Error("ttlMs must be positive");
    }
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
    /** @type {Map<unknown, {value: unknown, expiresAt: number}>} */
    this.entries = new Map();
    this.writeCount = 0;
  }

  /** @param {unknown} key */
  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  /** @param {unknown} key @param {unknown} value @param {number} [ttlMs] */
  set(key, value, ttlMs = this.ttlMs) {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new Error("ttlMs must be positive");
    }
    const now = Date.now();
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: now + ttlMs });

    this.writeCount++;
    if (this.writeCount % 64 === 0) this.pruneExpired(now);
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.entries.delete(oldestKey);
    }
    return this;
  }

  /** @param {unknown} key */
  delete(key) {
    return this.entries.delete(key);
  }

  clear() {
    this.entries.clear();
    this.writeCount = 0;
  }

  get size() {
    return this.entries.size;
  }

  /** @param {number} [now] */
  pruneExpired(now = Date.now()) {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
  }
}

export class BoundedTtlCache<K, V> {
  constructor(maxEntries: number, ttlMs: number);
  get(key: K): V | undefined;
  set(key: K, value: V, ttlMs?: number): this;
  delete(key: K): boolean;
  clear(): void;
  readonly size: number;
  pruneExpired(now?: number): void;
}

/**
 * Small LRU-bounded Map for ephemeral per-process state.
 * Evicted entries fail closed (for example, an auth challenge becomes invalid)
 * instead of allowing attacker-controlled keys to grow memory without limit.
 */
export class BoundedMap<K, V> extends Map<K, V> {
  constructor(private readonly maxEntries: number) {
    super();
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) {
      throw new Error("BoundedMap maxEntries must be a positive safe integer");
    }
  }

  override set(key: K, value: V): this {
    if (this.has(key)) {
      super.delete(key);
    } else if (this.size >= this.maxEntries) {
      const oldest = this.keys().next().value;
      if (oldest !== undefined) super.delete(oldest);
    }
    return super.set(key, value);
  }
}

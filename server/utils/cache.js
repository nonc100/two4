class MemoryCache {
  constructor({ ttlMs = 120 * 60 * 1000, maxEntries = 500 } = {}) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.store = new Map();
  }

  key(parts) {
    if (Array.isArray(parts)) {
      return parts.join('::');
    }
    if (typeof parts === 'object' && parts !== null) {
      return JSON.stringify(parts);
    }
    return String(parts);
  }

  get(rawKey) {
    const key = this.key(rawKey);
    const entry = this.store.get(key);
    if (!entry) {
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(rawKey, value, ttlOverride) {
    const key = this.key(rawKey);
    const ttlMs = Number.isFinite(ttlOverride) ? ttlOverride : this.ttlMs;
    const expiresAt = Date.now() + ttlMs;

    if (this.store.size >= this.maxEntries) {
      const firstKey = this.store.keys().next().value;
      if (firstKey) {
        this.store.delete(firstKey);
      }
    }

    this.store.set(key, { value, expiresAt });
    return value;
  }

  wrap(rawKey, loader, ttlOverride) {
    const cached = this.get(rawKey);
    if (cached !== null && cached !== undefined) {
      return Promise.resolve(cached);
    }
    return Promise.resolve()
      .then(loader)
      .then((value) => {
        this.set(rawKey, value, ttlOverride);
        return value;
      });
  }

  clear() {
    this.store.clear();
  }
}

function createMemoryCache(options) {
  return new MemoryCache(options);
}

module.exports = {
  MemoryCache,
  createMemoryCache,
};

// 内存缓存层，减少 KV 访问延迟
// Deno Deploy 是无状态的，但单次请求内可复用

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

class MemoryCache {
  private cache = new Map<string, CacheEntry<unknown>>()
  private maxSize = 100

  get<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }
    return entry.value
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value
      if (firstKey) this.cache.delete(firstKey)
    }
    this.cache.set(key, { value, expiresAt: Date.now() + ttlMs })
  }

  delete(key: string): void {
    this.cache.delete(key)
  }
}

export const memCache = new MemoryCache()

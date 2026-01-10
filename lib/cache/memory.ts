// 内存缓存层，减少 KV 访问延迟
// 使用 LRU 策略管理缓存

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

class MemoryCache {
  private cache = new Map<string, CacheEntry<unknown>>()
  private maxSize = 200

  get<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }
    // LRU: 移动到末尾（最近使用）
    this.cache.delete(key)
    this.cache.set(key, entry)
    return entry.value
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    // 如果 key 已存在，先删除（更新时也移动到末尾）
    if (this.cache.has(key)) {
      this.cache.delete(key)
    } else if (this.cache.size >= this.maxSize) {
      // LRU: 删除最旧的（第一个）
      const firstKey = this.cache.keys().next().value
      if (firstKey) this.cache.delete(firstKey)
    }
    this.cache.set(key, { value, expiresAt: Date.now() + ttlMs })
  }

  delete(key: string): void {
    this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
  }
}

export const memCache = new MemoryCache()

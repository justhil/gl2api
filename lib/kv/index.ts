// KV 兼容层：支持 Deno KV 和 Vercel KV
// 运行时自动检测环境

// Deno 类型声明
declare const Deno: {
  openKv: () => Promise<DenoKvInstance>
} | undefined

interface DenoKvInstance {
  get<T>(key: string[]): Promise<{ value: T | null }>
  set(key: string[], value: unknown, options?: { expireIn?: number }): Promise<void>
  delete(key: string[]): Promise<void>
}

interface KVInterface {
  get<T>(key: string): Promise<T | null>
  set(key: string, value: unknown, options?: { ex?: number }): Promise<void>
  del(key: string): Promise<void>
  smembers(key: string): Promise<string[]>
  sadd(key: string, ...members: string[]): Promise<void>
  srem(key: string, ...members: string[]): Promise<void>
}

// Deno KV 实现
class DenoKV implements KVInterface {
  private kv: DenoKvInstance | null = null

  private async getKv(): Promise<DenoKvInstance> {
    if (!this.kv) {
      this.kv = await Deno!.openKv()
    }
    return this.kv
  }

  async get<T>(key: string): Promise<T | null> {
    const kv = await this.getKv()
    const result = await kv.get<T>([key])
    return result.value
  }

  async set(key: string, value: unknown, options?: { ex?: number }): Promise<void> {
    const kv = await this.getKv()
    const opts: { expireIn?: number } = {}
    if (options?.ex) {
      opts.expireIn = options.ex * 1000 // Deno KV 使用毫秒
    }
    await kv.set([key], value, opts)
  }

  async del(key: string): Promise<void> {
    const kv = await this.getKv()
    await kv.delete([key])
  }

  async smembers(key: string): Promise<string[]> {
    const kv = await this.getKv()
    const result = await kv.get<string[]>([key, '_set'])
    return result.value || []
  }

  async sadd(key: string, ...members: string[]): Promise<void> {
    const kv = await this.getKv()
    const existing = await this.smembers(key)
    const set = new Set(existing)
    for (const m of members) set.add(m)
    await kv.set([key, '_set'], Array.from(set))
  }

  async srem(key: string, ...members: string[]): Promise<void> {
    const kv = await this.getKv()
    const existing = await this.smembers(key)
    const set = new Set(existing)
    for (const m of members) set.delete(m)
    await kv.set([key, '_set'], Array.from(set))
  }
}

// Vercel KV 实现（包装 @vercel/kv）
class VercelKV implements KVInterface {
  private kvModule: typeof import('@vercel/kv') | null = null

  private async getKv() {
    if (!this.kvModule) {
      this.kvModule = await import('@vercel/kv')
    }
    return this.kvModule.kv
  }

  async get<T>(key: string): Promise<T | null> {
    const kv = await this.getKv()
    return kv.get<T>(key)
  }

  async set(key: string, value: unknown, options?: { ex?: number }): Promise<void> {
    const kv = await this.getKv()
    if (options?.ex) {
      await kv.set(key, value, { ex: options.ex })
    } else {
      await kv.set(key, value)
    }
  }

  async del(key: string): Promise<void> {
    const kv = await this.getKv()
    await kv.del(key)
  }

  async smembers(key: string): Promise<string[]> {
    const kv = await this.getKv()
    return kv.smembers(key) as Promise<string[]>
  }

  async sadd(key: string, ...members: string[]): Promise<void> {
    const kv = await this.getKv()
    for (const m of members) {
      await kv.sadd(key, m)
    }
  }

  async srem(key: string, ...members: string[]): Promise<void> {
    const kv = await this.getKv()
    for (const m of members) {
      await kv.srem(key, m)
    }
  }
}

// 检测运行环境并导出对应实现
function createKV(): KVInterface {
  if (typeof Deno !== 'undefined' && typeof Deno.openKv === 'function') {
    return new DenoKV()
  }
  return new VercelKV()
}

export const kv = createKV()

import { kv } from '../kv'
import type { TokenCache } from '../gumloop/types'
import { firebaseRefresh, isTokenExpired } from '../gumloop/auth'
import { memCache } from './memory'

const TOKEN_PREFIX = 'token:'
const TOKEN_TTL = 3600 // 1 hour
const MEM_TTL = 300000 // 5 minutes in memory

export async function getToken(accountId: string, refreshToken: string): Promise<{ idToken: string; userId: string }> {
  const key = `${TOKEN_PREFIX}${accountId}`

  // 1. 先查内存缓存
  const memCached = memCache.get<TokenCache>(key)
  if (memCached && !isTokenExpired(memCached)) {
    return { idToken: memCached.idToken, userId: memCached.userId }
  }

  // 2. 查 KV 缓存
  const cached = await kv.get<TokenCache>(key)
  if (cached && !isTokenExpired(cached)) {
    memCache.set(key, cached, MEM_TTL)
    return { idToken: cached.idToken, userId: cached.userId }
  }

  // 3. 刷新 Token
  const newCache = await firebaseRefresh(refreshToken)
  await kv.set(key, newCache, { ex: TOKEN_TTL })
  memCache.set(key, newCache, MEM_TTL)
  return { idToken: newCache.idToken, userId: newCache.userId }
}

export async function getTokenFromCache(accountId: string): Promise<TokenCache | null> {
  return kv.get<TokenCache>(`${TOKEN_PREFIX}${accountId}`)
}

export async function setTokenCache(accountId: string, cache: TokenCache): Promise<void> {
  await kv.set(`${TOKEN_PREFIX}${accountId}`, cache, { ex: TOKEN_TTL })
}

export async function clearTokenCache(accountId: string): Promise<void> {
  await kv.del(`${TOKEN_PREFIX}${accountId}`)
}

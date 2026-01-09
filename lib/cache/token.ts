import { kv } from '@vercel/kv'
import type { TokenCache } from '../gumloop/types'
import { firebaseRefresh, isTokenExpired } from '../gumloop/auth'

const TOKEN_PREFIX = 'token:'
const TOKEN_TTL = 3600 // 1 hour

export async function getToken(accountId: string, refreshToken: string): Promise<{ idToken: string; userId: string }> {
  const key = `${TOKEN_PREFIX}${accountId}`
  const cached = await kv.get<TokenCache>(key)

  if (cached && !isTokenExpired(cached)) {
    return { idToken: cached.idToken, userId: cached.userId }
  }

  const newCache = await firebaseRefresh(refreshToken)
  await kv.set(key, newCache, { ex: TOKEN_TTL })
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

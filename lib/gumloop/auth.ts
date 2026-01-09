import type { TokenCache } from './types'

const FIREBASE_API_KEY = 'AIzaSyCYuXqbJ0YBNltoGS4-7Y6Hozrra8KKmaE'
const FIREBASE_REFRESH_URL = 'https://securetoken.googleapis.com/v1/token'

interface FirebaseRefreshResponse {
  id_token: string
  refresh_token: string
  user_id: string
  expires_in: string
}

export async function firebaseRefresh(refreshToken: string): Promise<TokenCache> {
  const resp = await fetch(`${FIREBASE_REFRESH_URL}?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  if (!resp.ok) {
    const error = await resp.json().catch(() => ({}))
    throw new Error(error?.error?.message || 'Firebase refresh failed')
  }

  const data: FirebaseRefreshResponse = await resp.json()
  const expiresIn = parseInt(data.expires_in, 10) || 3600

  return {
    idToken: data.id_token,
    refreshToken: data.refresh_token,
    userId: data.user_id,
    expiresAt: Date.now() + expiresIn * 1000,
  }
}

export function isTokenExpired(cache: TokenCache, bufferMs = 300000): boolean {
  return Date.now() >= cache.expiresAt - bufferMs
}

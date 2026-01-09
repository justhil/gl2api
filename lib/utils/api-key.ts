import { NextRequest } from 'next/server'

const ALLOWED_KEYS = process.env.OPENAI_KEYS?.split(',').map((k) => k.trim()).filter(Boolean) || []

export function extractApiKey(req: NextRequest): string | null {
  const auth = req.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) {
    return auth.slice(7).trim()
  }
  return req.headers.get('x-api-key')
}

export function verifyApiKey(req: NextRequest): { valid: boolean; key: string | null } {
  const key = extractApiKey(req)
  if (!ALLOWED_KEYS.length) {
    return { valid: true, key }
  }
  return { valid: key !== null && ALLOWED_KEYS.includes(key), key }
}

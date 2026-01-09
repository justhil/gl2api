import { NextRequest } from 'next/server'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'

export function verifyAdmin(req: NextRequest): boolean {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) {
    return false
  }
  return auth.slice(7) === ADMIN_PASSWORD
}

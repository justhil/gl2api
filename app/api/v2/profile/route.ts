import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/utils/admin'
import { getAccount } from '@/lib/db/accounts'
import { getToken } from '@/lib/cache/token'
import { getUserProfile, getCredits } from '@/lib/gumloop/api'

export async function GET(req: NextRequest) {
  if (!verifyAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const accountId = url.searchParams.get('accountId')
  if (!accountId) {
    return NextResponse.json({ error: 'accountId required' }, { status: 400 })
  }

  const account = await getAccount(accountId)
  if (!account?.refreshToken) {
    return NextResponse.json({ error: 'Account not found or invalid' }, { status: 404 })
  }

  try {
    const { idToken, userId } = await getToken(accountId, account.refreshToken)
    const profile = await getUserProfile(idToken, userId)
    const credits = await getCredits(idToken, userId)
    return NextResponse.json({ profile, credits })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

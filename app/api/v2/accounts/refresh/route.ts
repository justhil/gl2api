import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/utils/admin'
import { getAccounts, updateAccount } from '@/lib/db/accounts'
import { getToken } from '@/lib/cache/token'
import { getUserProfile } from '@/lib/gumloop/api'

export async function POST(req: NextRequest) {
  if (!verifyAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const accounts = await getAccounts()
  let updated = 0
  let failed = 0

  for (const account of accounts) {
    if (!account.refreshToken) {
      failed++
      continue
    }

    try {
      const tokenData = await getToken(account.id, account.refreshToken)
      const profile = await getUserProfile(tokenData.idToken, tokenData.userId)

      if (profile?.user_email && profile.user_email !== account.email) {
        await updateAccount(account.id, { email: profile.user_email })
        updated++
      }
    } catch {
      failed++
    }
  }

  return NextResponse.json({
    success: true,
    total: accounts.length,
    updated,
    failed
  })
}

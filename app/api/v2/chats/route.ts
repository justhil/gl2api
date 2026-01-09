import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/utils/admin'
import { getAccount } from '@/lib/db/accounts'
import { getToken } from '@/lib/cache/token'
import { getChatHistory } from '@/lib/gumloop/api'

export async function GET(req: NextRequest) {
  if (!verifyAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const accountId = url.searchParams.get('accountId')
  const gummieId = url.searchParams.get('gummieId')
  const page = parseInt(url.searchParams.get('page') || '1', 10)
  const pageSize = parseInt(url.searchParams.get('pageSize') || '20', 10)

  if (!accountId || !gummieId) {
    return NextResponse.json({ error: 'accountId and gummieId required' }, { status: 400 })
  }

  const account = await getAccount(accountId)
  if (!account?.refreshToken) {
    return NextResponse.json({ error: 'Account not found or invalid' }, { status: 404 })
  }

  try {
    const { idToken, userId } = await getToken(accountId, account.refreshToken)
    const chats = await getChatHistory(gummieId, idToken, userId, page, pageSize)
    return NextResponse.json({ chats })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyAdmin } from '@/lib/utils/admin'
import { getAccounts, createAccount } from '@/lib/db/accounts'
import { firebaseRefresh } from '@/lib/gumloop/auth'

const AccountCreateSchema = z.object({
  label: z.string().optional(),
  refreshToken: z.string(),
  userId: z.string().optional(),
  gummieId: z.string().optional(),
  enabled: z.boolean().default(true),
})

export async function GET(req: NextRequest) {
  if (!verifyAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const enabled = url.searchParams.get('enabled')
  const sortBy = url.searchParams.get('sort_by') || 'createdAt'
  const sortOrder = (url.searchParams.get('sort_order') || 'desc') as 'asc' | 'desc'

  const accounts = await getAccounts({
    enabled: enabled === null ? undefined : enabled === 'true',
    sortBy,
    sortOrder,
  })

  return NextResponse.json({ accounts, count: accounts.length })
}

export async function POST(req: NextRequest) {
  if (!verifyAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = AccountCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.issues }, { status: 400 })
  }

  const { refreshToken, label, gummieId, enabled } = parsed.data

  // Validate refreshToken by trying to refresh
  let userId = parsed.data.userId
  try {
    const tokenData = await firebaseRefresh(refreshToken)
    userId = tokenData.userId
  } catch (err) {
    return NextResponse.json({ error: `Invalid refreshToken: ${err}` }, { status: 400 })
  }

  const account = await createAccount({
    label,
    refreshToken,
    userId,
    gummieId,
    enabled,
  })

  return NextResponse.json(account)
}

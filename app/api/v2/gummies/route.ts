import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyAdmin } from '@/lib/utils/admin'
import { getAccount } from '@/lib/db/accounts'
import { getToken } from '@/lib/cache/token'
import { listGummies, createGummie } from '@/lib/gumloop/api'

const CreateGummieSchema = z.object({
  accountId: z.string(),
  name: z.string(),
  modelName: z.string().optional(),
  systemPrompt: z.string().optional(),
  description: z.string().optional(),
})

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
    const gummies = await listGummies(idToken, userId)
    return NextResponse.json({ gummies })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!verifyAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = CreateGummieSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.issues }, { status: 400 })
  }

  const { accountId, name, modelName, systemPrompt, description } = parsed.data
  const account = await getAccount(accountId)
  if (!account?.refreshToken) {
    return NextResponse.json({ error: 'Account not found or invalid' }, { status: 404 })
  }

  try {
    const { idToken, userId } = await getToken(accountId, account.refreshToken)
    const gummie = await createGummie(idToken, userId, { name, modelName, systemPrompt, description })
    return NextResponse.json({ gummie })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

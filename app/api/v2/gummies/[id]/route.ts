import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyAdmin } from '@/lib/utils/admin'
import { getAccount } from '@/lib/db/accounts'
import { getToken } from '@/lib/cache/token'
import { getGummie, updateGummie, deleteGummie } from '@/lib/gumloop/api'

const UpdateGummieSchema = z.object({
  name: z.string().optional(),
  model_name: z.string().optional(),
  system_prompt: z.string().optional(),
  description: z.string().optional(),
  is_active: z.boolean().optional(),
})

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: gummieId } = await params
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
    const gummie = await getGummie(gummieId, idToken, userId)
    if (!gummie) {
      return NextResponse.json({ error: 'Gummie not found' }, { status: 404 })
    }
    return NextResponse.json({ gummie })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: gummieId } = await params
  const url = new URL(req.url)
  const accountId = url.searchParams.get('accountId')
  if (!accountId) {
    return NextResponse.json({ error: 'accountId required' }, { status: 400 })
  }

  const body = await req.json()
  const parsed = UpdateGummieSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.issues }, { status: 400 })
  }

  const account = await getAccount(accountId)
  if (!account?.refreshToken) {
    return NextResponse.json({ error: 'Account not found or invalid' }, { status: 404 })
  }

  try {
    const { idToken, userId } = await getToken(accountId, account.refreshToken)
    const gummie = await updateGummie(gummieId, idToken, userId, parsed.data)
    return NextResponse.json({ gummie })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: gummieId } = await params
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
    const success = await deleteGummie(gummieId, idToken, userId)
    if (!success) {
      return NextResponse.json({ error: 'Failed to delete gummie' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

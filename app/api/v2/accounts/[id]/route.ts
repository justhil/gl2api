import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyAdmin } from '@/lib/utils/admin'
import { getAccount, updateAccount, deleteAccount } from '@/lib/db/accounts'
import { deleteGummie } from '@/lib/gumloop/api'
import { getToken } from '@/lib/cache/token'

const AccountUpdateSchema = z.object({
  label: z.string().optional(),
  refreshToken: z.string().optional(),
  userId: z.string().optional(),
  gummieId: z.string().optional(),
  enabled: z.boolean().optional(),
})

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const account = await getAccount(id)
  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }

  return NextResponse.json(account)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json()
  const parsed = AccountUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.issues }, { status: 400 })
  }

  const account = await updateAccount(id, parsed.data)
  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }

  return NextResponse.json(account)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const account = await getAccount(id)
  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }

  // 删除账号关联的所有 gummies
  if (account.gummies && account.refreshToken && account.userId) {
    try {
      const tokenData = await getToken(account.id, account.refreshToken)
      const gummieIds = Object.values(account.gummies)
      for (const gummieId of gummieIds) {
        try {
          await deleteGummie(gummieId, tokenData.idToken, account.userId)
        } catch (err) {
          console.error(`Failed to delete gummie ${gummieId}:`, err)
        }
      }
    } catch (err) {
      console.error('Failed to get token for deleting gummies:', err)
    }
  }

  const success = await deleteAccount(id)
  if (!success) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}

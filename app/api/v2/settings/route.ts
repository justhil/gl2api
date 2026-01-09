import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyAdmin } from '@/lib/utils/admin'
import { getGlobalSettings, updateGlobalSettings, getAccounts } from '@/lib/db/accounts'
import { getToken } from '@/lib/cache/token'
import { updateGummieConfig } from '@/lib/gumloop/client'

const UpdateSettingsSchema = z.object({
  systemPrompt: z.string(),
})

export async function GET(req: NextRequest) {
  if (!verifyAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const settings = await getGlobalSettings()
  return NextResponse.json(settings)
}

export async function POST(req: NextRequest) {
  if (!verifyAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = UpdateSettingsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.issues }, { status: 400 })
  }

  const { systemPrompt } = parsed.data

  // Update global settings
  const settings = await updateGlobalSettings({ systemPrompt })

  // Update all enabled accounts' gummies
  const accounts = await getAccounts({ enabled: true })
  const results: Array<{ accountId: string; gummieId: string; success: boolean; error?: string }> = []

  for (const account of accounts) {
    if (!account.gummieId || !account.refreshToken) continue

    try {
      const { idToken, userId } = await getToken(account.id, account.refreshToken)
      await updateGummieConfig(account.gummieId, userId, { systemPrompt })
      results.push({ accountId: account.id, gummieId: account.gummieId, success: true })
    } catch (err) {
      results.push({ accountId: account.id, gummieId: account.gummieId, success: false, error: String(err) })
    }
  }

  return NextResponse.json({
    settings,
    syncResults: results,
    syncedCount: results.filter((r) => r.success).length,
    totalCount: results.length,
  })
}

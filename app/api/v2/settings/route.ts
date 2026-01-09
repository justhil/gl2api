import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyAdmin } from '@/lib/utils/admin'
import { getGlobalSettings, updateGlobalSettings, getAccounts } from '@/lib/db/accounts'
import { getToken } from '@/lib/cache/token'
import { listGummies } from '@/lib/gumloop/api'
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

  // Update all accounts' gummies (including disabled accounts)
  const accounts = await getAccounts()
  let syncedCount = 0
  let totalCount = 0

  for (const account of accounts) {
    if (!account.refreshToken) continue

    try {
      const { idToken, userId } = await getToken(account.id, account.refreshToken)

      // Get all gummies for this account from API
      const gummies = await listGummies(idToken, userId)

      for (const gummie of gummies) {
        totalCount++
        try {
          await updateGummieConfig(gummie.gummie_id, userId, idToken, { systemPrompt })
          syncedCount++
        } catch (err) {
          console.error(`Failed to update gummie ${gummie.gummie_id}:`, err)
        }
      }
    } catch (err) {
      console.error(`Failed to get token for account ${account.id}:`, err)
    }
  }

  return NextResponse.json({
    settings,
    syncedCount,
    totalCount,
  })
}

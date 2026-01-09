import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyAdmin } from '@/lib/utils/admin'
import { getAccounts, createAccount, getGlobalSettings } from '@/lib/db/accounts'
import { firebaseRefresh } from '@/lib/gumloop/auth'
import { createGummie, listGummies, deleteGummie } from '@/lib/gumloop/api'
import { AVAILABLE_MODELS } from '@/lib/utils/model-map'
import type { ModelGummieMap } from '@/lib/gumloop/types'

const AccountCreateSchema = z.object({
  label: z.string().optional(),
  refreshToken: z.string(),
  userId: z.string().optional(),
  enabled: z.boolean().default(true),
  createGummies: z.boolean().default(true),  // 是否自动创建 gummie
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

  const { refreshToken, label, enabled, createGummies: shouldCreateGummies } = parsed.data

  // Validate refreshToken and get user info
  let idToken: string
  let userId: string
  try {
    const tokenData = await firebaseRefresh(refreshToken)
    idToken = tokenData.idToken
    userId = tokenData.userId
  } catch (err) {
    return NextResponse.json({ error: `Invalid refreshToken: ${err}` }, { status: 400 })
  }

  // Get global system prompt
  const globalSettings = await getGlobalSettings()
  const systemPrompt = globalSettings.systemPrompt || ''

  // Build gummies map
  const gummies: ModelGummieMap = {}
  let defaultGummieId: string | undefined
  let deletedCount = 0

  if (shouldCreateGummies) {
    // Delete all existing gummies first
    const existingGummies = await listGummies(idToken, userId)
    for (const g of existingGummies) {
      try {
        await deleteGummie(g.gummie_id, idToken, userId)
        deletedCount++
      } catch {}
    }

    // Create gummies for each model
    for (const modelName of AVAILABLE_MODELS) {
      try {
        const gummie = await createGummie(idToken, userId, {
          name: modelName,
          modelName,
          systemPrompt,
        })
        if (gummie) {
          gummies[modelName] = gummie.gummie_id
          if (!defaultGummieId) defaultGummieId = gummie.gummie_id
        }
      } catch (err) {
        console.error(`Failed to create gummie for ${modelName}:`, err)
      }
    }
  }

  const account = await createAccount({
    label,
    refreshToken,
    userId,
    gummieId: defaultGummieId,
    gummies,
    enabled,
  })

  return NextResponse.json({
    ...account,
    gummiesCreated: Object.keys(gummies).length,
    gummiesDeleted: deletedCount,
  })
}

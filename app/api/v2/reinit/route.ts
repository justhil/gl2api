import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/utils/admin'
import { getAccounts, updateAccount, getGlobalSettings } from '@/lib/db/accounts'
import { getToken } from '@/lib/cache/token'
import { listGummies, deleteGummie, createGummie } from '@/lib/gumloop/api'
import { AVAILABLE_MODELS, mapModel } from '@/lib/utils/model-map'
import type { ModelGummieMap } from '@/lib/gumloop/types'

export async function POST(req: NextRequest) {
  if (!verifyAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const globalSettings = await getGlobalSettings()
  const systemPrompt = globalSettings.systemPrompt || ''

  const accounts = await getAccounts()
  const results: Array<{
    accountId: string
    label?: string
    deleted: number
    created: number
    error?: string
  }> = []

  for (const account of accounts) {
    if (!account.refreshToken) {
      results.push({ accountId: account.id, label: account.label, deleted: 0, created: 0, error: 'No refreshToken' })
      continue
    }

    try {
      const { idToken, userId } = await getToken(account.id, account.refreshToken)

      // Delete all existing gummies
      const existingGummies = await listGummies(idToken, userId)
      let deletedCount = 0
      for (const g of existingGummies) {
        try {
          await deleteGummie(g.gummie_id, idToken, userId)
          deletedCount++
        } catch {}
      }

      // Create gummies for each model with correct model mapping
      const gummies: ModelGummieMap = {}
      let defaultGummieId: string | undefined

      for (const modelName of AVAILABLE_MODELS) {
        try {
          const gummie = await createGummie(idToken, userId, {
            name: modelName,
            modelName: mapModel(modelName),
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

      // Update account with new gummies mapping
      await updateAccount(account.id, {
        gummieId: defaultGummieId,
        gummies,
      })

      results.push({
        accountId: account.id,
        label: account.label,
        deleted: deletedCount,
        created: Object.keys(gummies).length,
      })
    } catch (err) {
      results.push({
        accountId: account.id,
        label: account.label,
        deleted: 0,
        created: 0,
        error: String(err),
      })
    }
  }

  const totalDeleted = results.reduce((sum, r) => sum + r.deleted, 0)
  const totalCreated = results.reduce((sum, r) => sum + r.created, 0)
  const successCount = results.filter(r => !r.error).length

  return NextResponse.json({
    success: true,
    accounts: results.length,
    successCount,
    totalDeleted,
    totalCreated,
    details: results,
  })
}

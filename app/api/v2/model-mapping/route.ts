import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/utils/admin'
import { getAccounts } from '@/lib/db/accounts'
import { AVAILABLE_MODELS } from '@/lib/utils/model-map'

export interface ModelMapping {
  model: string
  accounts: Array<{
    accountId: string
    accountLabel: string
    gummieId: string
  }>
}

export async function GET(req: NextRequest) {
  if (!verifyAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const accounts = await getAccounts({ enabled: true })
  const mappings: ModelMapping[] = []

  for (const model of AVAILABLE_MODELS) {
    const accountsForModel: ModelMapping['accounts'] = []
    for (const account of accounts) {
      const gummieId = account.gummies?.[model]
      if (gummieId) {
        accountsForModel.push({
          accountId: account.id,
          accountLabel: account.label || account.id,
          gummieId,
        })
      }
    }
    mappings.push({ model, accounts: accountsForModel })
  }

  return NextResponse.json({ mappings, totalModels: AVAILABLE_MODELS.length })
}

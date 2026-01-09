import { kv } from '@vercel/kv'
import type { Account } from '../gumloop/types'

const ACCOUNTS_KEY = 'accounts'
const ACCOUNT_PREFIX = 'account:'

function generateId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 8; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}

export async function getAccounts(options?: {
  enabled?: boolean
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}): Promise<Account[]> {
  const accountIds = await kv.smembers(ACCOUNTS_KEY) as string[]
  if (!accountIds.length) return []

  const accounts: Account[] = []
  for (const id of accountIds) {
    const account = await kv.get<Account>(`${ACCOUNT_PREFIX}${id}`)
    if (account) {
      if (options?.enabled !== undefined && account.enabled !== options.enabled) continue
      accounts.push(account)
    }
  }

  const sortBy = options?.sortBy || 'createdAt'
  const sortOrder = options?.sortOrder || 'desc'
  accounts.sort((a, b) => {
    const aVal = (a as unknown as Record<string, unknown>)[sortBy] as string
    const bVal = (b as unknown as Record<string, unknown>)[sortBy] as string
    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
    return sortOrder === 'desc' ? -cmp : cmp
  })

  return accounts
}

export async function getAccount(id: string): Promise<Account | null> {
  return kv.get<Account>(`${ACCOUNT_PREFIX}${id}`)
}

export async function createAccount(data: Partial<Account>): Promise<Account> {
  const id = generateId()
  const now = new Date().toISOString()
  const account: Account = {
    id,
    label: data.label,
    refreshToken: data.refreshToken,
    userId: data.userId,
    gummieId: data.gummieId,
    gummies: data.gummies,
    createdAt: now,
    updatedAt: now,
    enabled: data.enabled ?? true,
    errorCount: 0,
    successCount: 0,
  }

  await kv.set(`${ACCOUNT_PREFIX}${id}`, account)
  await kv.sadd(ACCOUNTS_KEY, id)

  return account
}

export async function updateAccount(id: string, data: Partial<Account>): Promise<Account | null> {
  const existing = await getAccount(id)
  if (!existing) return null

  const updated: Account = {
    ...existing,
    ...data,
    id,
    updatedAt: new Date().toISOString(),
  }

  await kv.set(`${ACCOUNT_PREFIX}${id}`, updated)
  return updated
}

export async function deleteAccount(id: string): Promise<boolean> {
  const existing = await getAccount(id)
  if (!existing) return false

  await kv.del(`${ACCOUNT_PREFIX}${id}`)
  await kv.srem(ACCOUNTS_KEY, id)
  return true
}

export async function incrementAccountStats(id: string, field: 'errorCount' | 'successCount'): Promise<void> {
  const account = await getAccount(id)
  if (!account) return

  await updateAccount(id, {
    [field]: (account[field] || 0) + 1,
  })
}

export async function getEnabledAccount(): Promise<Account | null> {
  const accounts = await getAccounts({ enabled: true })
  if (!accounts.length) return null
  return accounts[0]
}

// 根据模型获取对应的 gummieId
export function getGummieIdForModel(account: Account, model: string): string | null {
  // 优先从 gummies 映射中查找
  if (account.gummies && account.gummies[model]) {
    return account.gummies[model]
  }
  // 回退到默认 gummieId
  return account.gummieId || null
}

// ============ Global Settings ============

const GLOBAL_SETTINGS_KEY = 'global_settings'

export interface GlobalSettings {
  systemPrompt: string
}

export async function getGlobalSettings(): Promise<GlobalSettings> {
  const settings = await kv.get<GlobalSettings>(GLOBAL_SETTINGS_KEY)
  return settings || { systemPrompt: '' }
}

export async function updateGlobalSettings(data: Partial<GlobalSettings>): Promise<GlobalSettings> {
  const existing = await getGlobalSettings()
  const updated = { ...existing, ...data }
  await kv.set(GLOBAL_SETTINGS_KEY, updated)
  return updated
}

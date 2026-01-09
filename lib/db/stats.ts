import { kv } from '../kv'

const STATS_PREFIX = 'stats:'

export interface ModelStats {
  model: string
  count: number
  inputTokens: number
  outputTokens: number
}

function getDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function getWeekKey(date: Date): string {
  const d = new Date(date)
  d.setDate(d.getDate() - d.getDay())
  return `w:${d.toISOString().slice(0, 10)}`
}

function getMonthKey(date: Date): string {
  return `m:${date.toISOString().slice(0, 7)}`
}

export async function recordRequest(model: string, inputTokens: number, outputTokens: number): Promise<void> {
  const now = new Date()
  const dayKey = getDateKey(now)
  const weekKey = getWeekKey(now)
  const monthKey = getMonthKey(now)

  const keys = [dayKey, weekKey, monthKey]
  for (const key of keys) {
    const statsKey = `${STATS_PREFIX}${key}`
    const existing = await kv.get<Record<string, ModelStats>>(statsKey) || {}
    const current = existing[model] || { model, count: 0, inputTokens: 0, outputTokens: 0 }
    existing[model] = {
      model,
      count: current.count + 1,
      inputTokens: current.inputTokens + inputTokens,
      outputTokens: current.outputTokens + outputTokens,
    }
    await kv.set(statsKey, existing)
  }
}

export async function getStats(period: 'day' | 'week' | 'month'): Promise<ModelStats[]> {
  const now = new Date()
  let key: string
  switch (period) {
    case 'day':
      key = getDateKey(now)
      break
    case 'week':
      key = getWeekKey(now)
      break
    case 'month':
      key = getMonthKey(now)
      break
  }
  const data = await kv.get<Record<string, ModelStats>>(`${STATS_PREFIX}${key}`)
  return data ? Object.values(data) : []
}

export async function getAllStats(): Promise<{ day: ModelStats[]; week: ModelStats[]; month: ModelStats[] }> {
  const [day, week, month] = await Promise.all([
    getStats('day'),
    getStats('week'),
    getStats('month'),
  ])
  return { day, week, month }
}

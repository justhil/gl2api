// Gumloop 支持的模型列表
export const AVAILABLE_MODELS = [
  'claude-sonnet-4-5',
  'claude-opus-4-5',
  'claude-haiku-4-5',
  'claude-sonnet-4-20250514',
  'claude-opus-4-1',
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  'o3',
  'o4-mini',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
] as const

export type GumloopModel = (typeof AVAILABLE_MODELS)[number]

// 模型别名映射
const MODEL_ALIASES: Record<string, GumloopModel> = {
  // Claude 别名
  'claude-3-5-sonnet': 'claude-sonnet-4-5',
  'claude-3-5-haiku': 'claude-haiku-4-5',
  'claude-3-opus': 'claude-opus-4-5',
  'claude-sonnet': 'claude-sonnet-4-5',
  'claude-opus': 'claude-opus-4-5',
  'claude-haiku': 'claude-haiku-4-5',

  // OpenAI 别名
  'gpt-4': 'gpt-4o',
  'gpt-4-turbo': 'gpt-4o',
  'gpt-3.5-turbo': 'gpt-4o-mini',
  'gpt-3.5': 'gpt-4o-mini',
  'o1': 'o3',
  'o1-mini': 'o4-mini',

  // Gemini 别名
  'gemini-pro': 'gemini-2.5-pro',
  'gemini-flash': 'gemini-2.5-flash',
}

export function mapModel(model: string): GumloopModel {
  const m = model.toLowerCase().trim()

  // 直接匹配
  if (AVAILABLE_MODELS.includes(m as GumloopModel)) {
    return m as GumloopModel
  }

  // 别名匹配
  if (MODEL_ALIASES[m]) {
    return MODEL_ALIASES[m]
  }

  // 模糊匹配
  if (m.includes('opus')) return 'claude-opus-4-5'
  if (m.includes('haiku')) return 'claude-haiku-4-5'
  if (m.includes('sonnet')) return 'claude-sonnet-4-5'
  if (m.includes('o3')) return 'o3'
  if (m.includes('o4')) return 'o4-mini'
  if (m.includes('gemini') && m.includes('pro')) return 'gemini-2.5-pro'
  if (m.includes('gemini') && m.includes('flash')) return 'gemini-2.5-flash'
  if (m.includes('gpt-4') && m.includes('mini')) return 'gpt-4o-mini'
  if (m.includes('gpt-4')) return 'gpt-4o'

  // 默认
  return 'claude-sonnet-4-5'
}

export function isValidModel(model: string): boolean {
  return AVAILABLE_MODELS.includes(model as GumloopModel)
}

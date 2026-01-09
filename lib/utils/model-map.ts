// 模型映射：客户端名称 → Gumloop 实际名称（仅需映射的模型）
const MODEL_MAPPING: Record<string, string> = {
  'claude-3-7-sonnet-20250219': 'claude-3-7-sonnet-latest',
  'claude-haiku-4-5-20251001': 'claude-haiku-4-5',
  'claude-opus-4-5-20251101': 'claude-opus-4-5',
  'claude-sonnet-4-20250514': 'claude-sonnet-4-0',
  'claude-sonnet-4-5-20250929': 'claude-sonnet-4-5',
}

// 其他模型（无需映射，名称直接使用）
const OTHER_MODELS = [
  // Anthropic Claude（无需映射）
  'claude-opus-4-1',
  'claude-opus-4-0',

  // OpenAI GPT
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  'gpt-5.2',
  'gpt-5.1',
  'gpt-5',
  'gpt-5-mini',
  'gpt-5-nano',

  // OpenAI o-series
  'o3',
  'o4-mini',
  'o3-deep-research',
  'o4-mini-deep-research',

  // Google Gemini
  'gemini-3-pro-preview',
  'gemini-3-flash',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
] as const

// 对外暴露的模型列表：映射后的 Claude 模型 + 其他模型
export const AVAILABLE_MODELS = [
  ...Object.keys(MODEL_MAPPING),
  ...OTHER_MODELS,
] as const

export type GumloopModel = (typeof AVAILABLE_MODELS)[number]

// 将客户端模型名映射为 Gumloop 实际模型名
export function mapModel(model: string): string {
  const normalized = model.toLowerCase().trim()
  return MODEL_MAPPING[normalized] || normalized
}

export function isValidModel(model: string): boolean {
  return AVAILABLE_MODELS.includes(model as GumloopModel)
}

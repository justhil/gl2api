// Gumloop 支持的模型列表

export const AVAILABLE_MODELS = [
  // Anthropic Claude
  'claude-4.5-opus',
  'claude-4.1-opus',
  'claude-4-opus',
  'claude-4.5-sonnet',
  'claude-4-sonnet',
  'claude-3.7-sonnet',
  'claude-4.5-haiku',

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
  'gemini-3-pro',
  'gemini-3-flash',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
] as const

export type GumloopModel = (typeof AVAILABLE_MODELS)[number]

// 直接返回模型名，不做映射
export function mapModel(model: string): string {
  return model.toLowerCase().trim()
}

export function isValidModel(model: string): boolean {
  return AVAILABLE_MODELS.includes(model as GumloopModel)
}

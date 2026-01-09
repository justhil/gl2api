// Gumloop 支持的模型列表 (model_name)

export const AVAILABLE_MODELS = [
  // Anthropic Claude
  'claude-opus-4-5',      // Claude 4.5 Opus
  'claude-opus-4-1',      // Claude 4.1 Opus
  'claude-opus-4-0',      // Claude 4 Opus
  'claude-sonnet-4-5',    // Claude 4.5 Sonnet
  'claude-sonnet-4-0',    // Claude 4 Sonnet
  'claude-3-7-sonnet-latest', // Claude 3.7 Sonnet
  'claude-haiku-4-5',     // Claude 4.5 Haiku

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
  'gemini-3-pro-preview', // Gemini 3 Pro
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

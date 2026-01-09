// Gumloop 支持的原始模型名称
// 来源: https://docs.gumloop.com/core-concepts/ai_models

export const AVAILABLE_MODELS = [
  // Expert (30 credits)
  'o3',
  'o3-deep-research',
  'gpt-5',
  'claude-4.1-opus',
  'claude-4-opus',
  'claude-3.7-sonnet-thinking',

  // Advanced (20 credits)
  'gpt-4.1',
  'o4-mini',
  'o4-mini-deep-research',
  'claude-4-sonnet',
  'claude-3.7-sonnet',
  'gemini-2.5-pro',
  'perplexity-sonar-reasoning-pro',
  'perplexity-sonar-reasoning',
  'perplexity-sonar-pro',
  'perplexity-sonar-deep-research',
  'llama-3-405b-instruct',
  'grok-4',
  'grok-3',

  // Standard (2 credits)
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  'gpt-5-mini',
  'gpt-5-nano',
  'claude-3.5-haiku',
  'gemini-2.5-flash',
  'perplexity-sonar',
  'llama-3-70b',
  'grok-3-mini',
  'deepseek-v3',
  'deepseek-r1',

  // Vision
  'gpt-4.1-vision',
  'gpt-4.1-mini-vision',
  'gpt-4.1-nano-vision',
  'gpt-5-mini-vision',
  'gpt-5-nano-vision',
] as const

export type GumloopModel = (typeof AVAILABLE_MODELS)[number]

// 直接返回模型名，不做映射
export function mapModel(model: string): string {
  return model.toLowerCase().trim()
}

export function isValidModel(model: string): boolean {
  return AVAILABLE_MODELS.includes(model as GumloopModel)
}

// 模型映射：客户端名称 → Gumloop 实际名称
const MODEL_MAPPING: Record<string, string> = {
  // Anthropic Claude 映射
  'claude-3-7-sonnet-20250219': 'claude-3-7-sonnet-latest',
  'claude-haiku-4-5-20251001': 'claude-haiku-4-5',
  'claude-opus-4-5-20251101': 'claude-opus-4-5',
  'claude-sonnet-4-20250514': 'claude-sonnet-4-0',
  'claude-sonnet-4-5-20250929': 'claude-sonnet-4-5',
}

// 对外暴露的模型列表（客户端使用的名称）
export const AVAILABLE_MODELS = Object.keys(MODEL_MAPPING) as readonly string[]

export type GumloopModel = string

// 将客户端模型名映射为 Gumloop 实际模型名
export function mapModel(model: string): string {
  const normalized = model.toLowerCase().trim()
  return MODEL_MAPPING[normalized] || normalized
}

export function isValidModel(model: string): boolean {
  return model in MODEL_MAPPING
}

import { z } from 'zod'

// ============ Gumloop Message Part Types ============

export interface GumloopFilePart {
  id: string
  type: 'file'
  timestamp: string
  file: {
    filename: string
    media_type: string
    preview_url: string
  }
}

export interface GumloopTextPart {
  id: string
  type: 'text'
  text: string
  timestamp?: string
}

export type GumloopMessagePart = GumloopFilePart | GumloopTextPart

// ============ Gumloop Internal Types ============

export interface GumloopMessage {
  id: string
  role: 'user' | 'assistant'
  content?: string
  timestamp?: string
  parts?: GumloopMessagePart[]
}

export interface GumloopEvent {
  type: string
  id?: string
  delta?: string
  usage?: { input_tokens?: number; output_tokens?: number }
  finishReason?: string
}

export interface TokenCache {
  idToken: string
  refreshToken: string
  userId: string
  expiresAt: number
}

// ============ Account Types ============

// 模型到 Gummie ID 的映射
export type ModelGummieMap = Record<string, string>

export interface Account {
  id: string
  label?: string
  refreshToken?: string
  userId?: string
  gummieId?: string  // 默认 gummie（兼容旧逻辑）
  gummies?: ModelGummieMap  // 模型 -> gummieId 映射
  createdAt: string
  updatedAt: string
  enabled: boolean
  errorCount: number
  successCount: number
}

// ============ Claude API Types ============

export const ClaudeToolSchema = z.object({
  name: z.string(),
  description: z.string().optional().default(''),
  input_schema: z.record(z.any()),
})

export const ClaudeMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.union([z.string(), z.array(z.record(z.any()))]),
})

export const ClaudeRequestSchema = z.object({
  model: z.string(),
  messages: z.array(ClaudeMessageSchema),
  max_tokens: z.number().default(4096),
  temperature: z.number().optional(),
  tools: z.array(ClaudeToolSchema).optional(),
  stream: z.boolean().default(false),
  system: z.union([z.string(), z.array(z.record(z.any()))]).optional(),
  thinking: z.record(z.any()).optional(),
})

export type ClaudeTool = z.infer<typeof ClaudeToolSchema>
export type ClaudeMessage = z.infer<typeof ClaudeMessageSchema>
export type ClaudeRequest = z.infer<typeof ClaudeRequestSchema>

// ============ OpenAI API Types ============

export const OpenAIMessageSchema = z.object({
  role: z.string(),
  content: z.any(),
})

export const ChatCompletionRequestSchema = z.object({
  model: z.string().optional(),
  messages: z.array(OpenAIMessageSchema),
  stream: z.boolean().optional().default(false),
  temperature: z.number().optional(),
  max_tokens: z.number().optional(),
})

export const ResponsesRequestSchema = z.object({
  model: z.string().optional(),
  input: z.union([z.string(), z.array(z.record(z.any()))]),
  instructions: z.string().optional(),
  stream: z.boolean().optional().default(false),
})

export type OpenAIMessage = z.infer<typeof OpenAIMessageSchema>
export type ChatCompletionRequest = z.infer<typeof ChatCompletionRequestSchema>
export type ResponsesRequest = z.infer<typeof ResponsesRequestSchema>

// ============ Gemini API Types ============

export const GeminiPartSchema = z.object({
  text: z.string().optional(),
  // TODO: 图片支持 - 待抓包完善
  // inline_data: z.object({
  //   mime_type: z.string(),
  //   data: z.string(), // base64
  // }).optional(),
})

export const GeminiContentSchema = z.object({
  parts: z.array(GeminiPartSchema),
  role: z.string().optional(),
})

export const GeminiRequestSchema = z.object({
  contents: z.array(GeminiContentSchema),
  generationConfig: z.record(z.any()).optional(),
})

export type GeminiPart = z.infer<typeof GeminiPartSchema>
export type GeminiContent = z.infer<typeof GeminiContentSchema>
export type GeminiRequest = z.infer<typeof GeminiRequestSchema>

// ============ Image Support ============
// Gumloop 图片处理流程:
// 1. 上传图片到 /upload_chunk + /merge_chunks 获取 preview_url
// 2. 在消息 parts 中使用 type: "file" 携带图片信息

// Claude API 图片格式
export interface ClaudeImageContent {
  type: 'image'
  source: {
    type: 'base64' | 'url'
    media_type?: string
    data?: string
    url?: string
  }
}

// OpenAI API 图片格式
export interface OpenAIImageContent {
  type: 'image_url'
  image_url: {
    url: string
    detail?: 'low' | 'high' | 'auto'
  }
}

// Gemini API 图片格式
export interface GeminiImageContent {
  inline_data: {
    mime_type: string
    data: string
  }
}

// ============ Gumloop API Types ============

export interface Gummie {
  gummie_id: string
  name: string
  model_name: string
  system_prompt: string
  description: string
  is_active: boolean
  created_ts: string
  tools: unknown[]
  resources: unknown[]
  metadata?: {
    icon_url?: string
    slack?: Record<string, unknown>
  }
}

export interface ChatHistory {
  interaction_id: string
  gummie_id: string
  first_message: string
  type: string
  created_ts: string
  creator_user_id: string
  creator_user_email: string
  creator_first_name: string
  creator_last_name: string
}

export interface UserProfile {
  user_id: string
  user_email: string
  first_name: string
  last_name: string
  subscription_tier: string
  credit_limit: number
  is_credit_overage_enabled: boolean
  is_low_credit_warning_enabled: boolean
  low_credit_warning_threshold_percent: string
  is_out_of_credits_notification_enabled: boolean
  timezone: string
  latest_activity_ts: string
  color_scheme: string
  organization: unknown
}

const API_BASE = 'https://api.gumloop.com'

export interface UploadedImage {
  filename: string
  media_type: string
  preview_url: string
}

export interface ImagePart {
  id: string
  type: 'file'
  timestamp: string
  file: UploadedImage
}

/**
 * 将 base64 转换为 Blob
 */
function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64)
  const byteNumbers = new Array(byteCharacters.length)
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i)
  }
  const byteArray = new Uint8Array(byteNumbers)
  return new Blob([byteArray], { type: mimeType })
}

/**
 * 上传图片到 Gumloop
 * 使用 upload_chunk (multipart/form-data) + merge_chunks (JSON) 流程
 *
 * @param base64Data - 图片的 base64 数据（不含 data:xxx;base64, 前缀）
 * @param mediaType - 图片 MIME 类型，如 image/jpeg, image/png
 * @param chatId - 对话 ID
 * @param userId - 用户 ID
 * @param idToken - 认证 token
 * @returns 上传后的图片信息
 */
export async function uploadImage(
  base64Data: string,
  mediaType: string,
  chatId: string,
  userId: string,
  idToken: string
): Promise<UploadedImage> {
  const ext = mediaType.split('/')[1] || 'jpg'
  const filename = `custom_agent_interactions/${chatId}/image_${Date.now()}.${ext}`

  // Step 1: 使用 multipart/form-data 上传 chunk
  const formData = new FormData()
  const blob = base64ToBlob(base64Data, 'application/octet-stream')
  formData.append('file', blob, filename)
  formData.append('user_id', userId)
  formData.append('chunk_index', '0')
  formData.append('total_chunks', '1')
  formData.append('file_name', filename)

  const chunkResp = await fetch(`${API_BASE}/upload_chunk`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${idToken}`,
      'x-auth-key': userId,
      'Referer': 'https://www.gumloop.com/',
      'Origin': 'https://www.gumloop.com',
    },
    body: formData,
  })

  if (!chunkResp.ok) {
    throw new Error(`Failed to upload chunk: ${await chunkResp.text()}`)
  }

  const chunkResult = await chunkResp.json()
  if (!chunkResult.success || !chunkResult.upload_id) {
    throw new Error(`Upload chunk failed: ${JSON.stringify(chunkResult)}`)
  }

  // Step 2: 使用 JSON 合并 chunks 并获取 preview_url
  const mergeResp = await fetch(`${API_BASE}/merge_chunks`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${idToken}`,
      'x-auth-key': userId,
      'Content-Type': 'application/json',
      'Referer': 'https://www.gumloop.com/',
      'Origin': 'https://www.gumloop.com',
    },
    body: JSON.stringify({
      file_name: filename,
      total_chunks: 1,
      user_id: userId,
      upload_id: chunkResult.upload_id,
      content_type: mediaType,
      return_preview_url: true,
    }),
  })

  if (!mergeResp.ok) {
    throw new Error(`Failed to merge chunks: ${await mergeResp.text()}`)
  }

  const mergeResult = await mergeResp.json()
  if (!mergeResult.success || !mergeResult.preview_url) {
    throw new Error(`Merge chunks failed: ${JSON.stringify(mergeResult)}`)
  }

  return {
    filename,
    media_type: mediaType,
    preview_url: mergeResult.preview_url,
  }
}

/**
 * 从各种 API 格式中提取图片信息
 */
export interface ExtractedImage {
  base64Data: string
  mediaType: string
}

/**
 * 从 Claude API 格式提取图片
 * { type: 'image', source: { type: 'base64', media_type: 'image/png', data: '...' } }
 */
export function extractClaudeImage(content: unknown): ExtractedImage | null {
  if (!content || typeof content !== 'object') return null
  const c = content as Record<string, unknown>
  if (c.type !== 'image') return null

  const source = c.source as Record<string, unknown> | undefined
  if (!source || source.type !== 'base64') return null

  const data = source.data as string | undefined
  const mediaType = source.media_type as string | undefined
  if (!data || !mediaType) return null

  return { base64Data: data, mediaType }
}

/**
 * 从 OpenAI API 格式提取图片
 * { type: 'image_url', image_url: { url: 'data:image/png;base64,...' } }
 */
export function extractOpenAIImage(content: unknown): ExtractedImage | null {
  if (!content || typeof content !== 'object') return null
  const c = content as Record<string, unknown>
  if (c.type !== 'image_url') return null

  const imageUrl = c.image_url as Record<string, unknown> | undefined
  if (!imageUrl) return null

  const url = imageUrl.url as string | undefined
  if (!url) return null

  // 解析 data URL: data:image/png;base64,xxxxx
  const match = url.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null

  return { base64Data: match[2], mediaType: match[1] }
}

/**
 * 从 Gemini API 格式提取图片
 * { inline_data: { mime_type: 'image/png', data: '...' } }
 */
export function extractGeminiImage(content: unknown): ExtractedImage | null {
  if (!content || typeof content !== 'object') return null
  const c = content as Record<string, unknown>

  const inlineData = c.inline_data as Record<string, unknown> | undefined
  if (!inlineData) return null

  const data = inlineData.data as string | undefined
  const mimeType = inlineData.mime_type as string | undefined
  if (!data || !mimeType) return null

  return { base64Data: data, mediaType: mimeType }
}

/**
 * 从任意格式提取图片
 */
export function extractImage(content: unknown): ExtractedImage | null {
  return extractClaudeImage(content) || extractOpenAIImage(content) || extractGeminiImage(content)
}

/**
 * 创建图片 part 用于 Gumloop 消息
 */
export function createImagePart(uploadedImage: UploadedImage): ImagePart {
  const partId = `part_${Math.random().toString(36).slice(2, 24)}`
  return {
    id: partId,
    type: 'file',
    timestamp: new Date().toISOString(),
    file: uploadedImage,
  }
}

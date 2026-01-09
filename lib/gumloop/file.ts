const API_BASE = 'https://api.gumloop.com'

// Base64 decode compatible with both Node.js and Deno
function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(base64, 'base64')
  }
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

export interface UploadedFile {
  filename: string
  media_type: string
  preview_url: string
}

export interface FilePart {
  id: string
  type: 'file'
  timestamp: string
  file: UploadedFile
}

export interface ExtractedFile {
  base64Data: string
  mediaType: string
  filename?: string
}

const SUPPORTED_MEDIA_TYPES: Record<string, string> = {
  // 图片
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  // 文档
  'text/plain': 'txt',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/csv': 'csv',
  'text/markdown': 'md',
  'application/json': 'json',
  'text/html': 'html',
  'text/xml': 'xml',
  'application/xml': 'xml',
}

function getExtension(mediaType: string, filename?: string): string {
  if (filename) {
    const ext = filename.split('.').pop()
    if (ext) return ext
  }
  return SUPPORTED_MEDIA_TYPES[mediaType] || mediaType.split('/')[1] || 'bin'
}

function isImageType(mediaType: string): boolean {
  return mediaType.startsWith('image/')
}

function getFilePrefix(mediaType: string): string {
  return isImageType(mediaType) ? 'image' : 'file'
}

export async function uploadFile(
  base64Data: string,
  mediaType: string,
  chatId: string,
  userId: string,
  idToken: string,
  originalFilename?: string
): Promise<UploadedFile> {
  // 使用原始文件名，如果没有则生成默认名称
  const ext = getExtension(mediaType, originalFilename)
  const baseName = originalFilename || `${getFilePrefix(mediaType)}_${Date.now()}.${ext}`
  const filename = `custom_agent_interactions/${chatId}/${baseName}`

  const formData = new FormData()
  const binaryData = base64ToUint8Array(base64Data)
  const blob = new Blob([binaryData as BlobPart], { type: 'application/octet-stream' })
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

// Claude API: { type: 'image', source: { type: 'base64', media_type: '...', data: '...' } }
export function extractClaudeImage(content: unknown): ExtractedFile | null {
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

// Claude API: { type: 'document', source: { type: 'base64', media_type: '...', data: '...' }, filename?: '...' }
export function extractClaudeDocument(content: unknown): ExtractedFile | null {
  if (!content || typeof content !== 'object') return null
  const c = content as Record<string, unknown>
  if (c.type !== 'document') return null

  const source = c.source as Record<string, unknown> | undefined
  if (!source || source.type !== 'base64') return null

  const data = source.data as string | undefined
  const mediaType = source.media_type as string | undefined
  if (!data || !mediaType) return null

  const filename = c.filename as string | undefined
  return { base64Data: data, mediaType, filename }
}

// OpenAI API: { type: 'image_url', image_url: { url: 'data:image/png;base64,...' } }
export function extractOpenAIImage(content: unknown): ExtractedFile | null {
  if (!content || typeof content !== 'object') return null
  const c = content as Record<string, unknown>
  if (c.type !== 'image_url') return null

  const imageUrl = c.image_url as Record<string, unknown> | undefined
  if (!imageUrl) return null

  const url = imageUrl.url as string | undefined
  if (!url) return null

  const match = url.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null

  return { base64Data: match[2], mediaType: match[1] }
}

// OpenAI API: { type: 'file', file: { file_data: 'data:...;base64,...', filename: '...' } }
// 或 { type: 'input_file', input_file: { file_data: 'data:...;base64,...', filename: '...' } }
export function extractOpenAIFile(content: unknown): ExtractedFile | null {
  if (!content || typeof content !== 'object') return null
  const c = content as Record<string, unknown>

  let fileObj: Record<string, unknown> | undefined
  if (c.type === 'file') {
    fileObj = c.file as Record<string, unknown> | undefined
  } else if (c.type === 'input_file') {
    fileObj = c.input_file as Record<string, unknown> | undefined
  }
  if (!fileObj) return null

  const fileData = fileObj.file_data as string | undefined
  if (!fileData) return null

  const match = fileData.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null

  const filename = fileObj.filename as string | undefined
  return { base64Data: match[2], mediaType: match[1], filename }
}


export function extractFile(content: unknown): ExtractedFile | null {
  return (
    extractClaudeImage(content) ||
    extractClaudeDocument(content) ||
    extractOpenAIImage(content) ||
    extractOpenAIFile(content)
  )
}

export function createFilePart(uploadedFile: UploadedFile): FilePart {
  const partId = `part_${Math.random().toString(36).slice(2, 24)}`
  return {
    id: partId,
    type: 'file',
    timestamp: new Date().toISOString(),
    file: uploadedFile,
  }
}

// 兼容旧 API
export const uploadImage = uploadFile
export const createImagePart = createFilePart
export type UploadedImage = UploadedFile
export type ImagePart = FilePart
export type ExtractedImage = ExtractedFile
export const extractImage = extractFile

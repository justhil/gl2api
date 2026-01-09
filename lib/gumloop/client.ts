import WebSocket from 'ws'
import type { GumloopEvent, GumloopMessage, GumloopMessagePart } from './types'
import type { ImagePart } from './image'

const WS_URL = 'wss://ws.gumloop.com/ws/gummies'
const API_BASE = 'https://api.gumloop.com'

export function generateChatId(len = 22): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < len; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}

export interface Message {
  role: string
  content: string
  id?: string
  images?: ImagePart[]
}

function formatMessages(messages: Message[]): GumloopMessage[] {
  return messages.map((msg) => {
    const msgId = msg.id || `msg_${generateChatId(24)}`
    const timestamp = new Date().toISOString()

    if (msg.role === 'assistant') {
      return {
        id: msgId,
        role: 'assistant' as const,
        parts: [{ id: `${msgId}_part`, type: 'text', text: msg.content }],
      }
    }

    // 用户消息：可能包含图片
    const parts: GumloopMessagePart[] = []

    // 添加图片 parts
    if (msg.images?.length) {
      for (const img of msg.images) {
        parts.push(img)
      }
    }

    // 如果有图片，返回带 parts 的格式
    if (parts.length > 0) {
      return {
        id: msgId,
        role: 'user' as const,
        timestamp,
        content: msg.content,
        parts,
      }
    }

    // 纯文本消息
    return {
      id: msgId,
      role: 'user' as const,
      content: msg.content,
    }
  })
}

export interface GumloopTool {
  name: string
  description: string
  input_schema: unknown
}

export async function updateGummieConfig(
  gummieId: string,
  userId: string,
  idToken: string,
  options: {
    systemPrompt?: string
    tools?: GumloopTool[]
    modelName?: string
  }
): Promise<void> {
  const payload: Record<string, unknown> = {}
  if (options.systemPrompt !== undefined) payload.system_prompt = options.systemPrompt
  if (options.tools !== undefined) payload.tools = options.tools
  if (options.modelName !== undefined) payload.model_name = options.modelName

  if (Object.keys(payload).length === 0) return

  const resp = await fetch(`${API_BASE}/gummies/${gummieId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${idToken}`,
      'x-auth-key': userId,
      'Content-Type': 'application/json',
      'Referer': 'https://www.gumloop.com/',
      'Origin': 'https://www.gumloop.com',
    },
    body: JSON.stringify(payload),
  })

  if (!resp.ok) {
    const error = await resp.text()
    throw new Error(`Failed to update gummie config: ${error}`)
  }
}

export async function* sendChat(
  gummieId: string,
  messages: Message[],
  idToken: string,
  interactionId?: string
): AsyncGenerator<GumloopEvent> {
  const chatId = interactionId || generateChatId()
  const gumloopMsgs = formatMessages(messages)

  const payload = {
    type: 'start',
    payload: {
      id_token: idToken,
      context: {
        chat: { id: chatId, msgs: gumloopMsgs },
        type: 'chat',
        gummie_id: gummieId,
      },
    },
  }

  const ws = new WebSocket(WS_URL, {
    headers: { Origin: 'https://www.gumloop.com' },
  })

  type QueueItem = { type: 'event'; event: GumloopEvent } | { type: 'done' } | { type: 'error'; error: Error }
  const queue: QueueItem[] = []
  let resolve: (() => void) | null = null

  const push = (item: QueueItem) => {
    queue.push(item)
    if (resolve) {
      resolve()
      resolve = null
    }
  }

  ws.on('open', () => {
    ws.send(JSON.stringify(payload))
  })

  ws.on('message', (data) => {
    try {
      const event = JSON.parse(data.toString()) as GumloopEvent
      push({ type: 'event', event })
      if (event.type === 'finish') {
        ws.close()
      }
    } catch {
      // ignore parse errors
    }
  })

  ws.on('error', (err) => {
    push({ type: 'error', error: err })
  })

  ws.on('close', () => {
    push({ type: 'done' })
  })

  while (true) {
    while (queue.length === 0) {
      await new Promise<void>((r) => { resolve = r })
    }

    const item = queue.shift()!
    if (item.type === 'error') throw item.error
    if (item.type === 'done') break
    yield item.event
    if (item.event.type === 'finish') break
  }
}

import type { GumloopEvent, GumloopMessage, GumloopMessagePart } from './types'
import type { FilePart } from './file'

const WS_URL = 'wss://ws.gumloop.com/ws/gummies'
const API_BASE = 'https://api.gumloop.com'

// Use native WebSocket for Deno compatibility
const WS = typeof globalThis.WebSocket !== 'undefined' ? globalThis.WebSocket : (await import('ws')).default

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
  files?: FilePart[]
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

    const parts: GumloopMessagePart[] = []

    if (msg.files?.length) {
      for (const file of msg.files) {
        parts.push(file)
      }
    }

    if (parts.length > 0) {
      return {
        id: msgId,
        role: 'user' as const,
        timestamp,
        content: msg.content,
        parts,
      }
    }

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

  const ws = new WS(WS_URL)

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

  ws.onopen = () => {
    ws.send(JSON.stringify(payload))
  }

  ws.onmessage = (event: MessageEvent) => {
    try {
      const data = typeof event.data === 'string' ? event.data : event.data.toString()
      const parsed = JSON.parse(data) as GumloopEvent
      push({ type: 'event', event: parsed })
      if (parsed.type === 'finish' && parsed.final !== false) {
        ws.close()
      }
    } catch {
      // ignore parse errors
    }
  }

  ws.onerror = (err: Event) => {
    push({ type: 'error', error: err instanceof Error ? err : new Error(String(err)) })
  }

  ws.onclose = () => {
    push({ type: 'done' })
  }

  while (true) {
    while (queue.length === 0) {
      await new Promise<void>((r) => { resolve = r })
    }

    const item = queue.shift()!
    if (item.type === 'error') throw item.error
    if (item.type === 'done') {
      break
    }
    yield item.event
    if (item.event.type === 'finish' && item.event.final !== false) {
      break
    }
  }
}

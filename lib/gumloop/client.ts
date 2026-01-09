import WebSocket from 'ws'
import type { GumloopEvent, GumloopMessage } from './types'

const WS_URL = 'wss://ws.gumloop.com/ws/gummies'
const API_BASE = 'https://api.gumloop.com'

function generateId(len = 22): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < len; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}

interface Message {
  role: string
  content: string
  id?: string
}

function formatMessages(messages: Message[]): GumloopMessage[] {
  return messages.map((msg) => {
    const msgId = msg.id || `msg_${generateId(24)}`
    if (msg.role === 'assistant') {
      return {
        id: msgId,
        role: 'assistant' as const,
        parts: [{ id: `${msgId}_part`, type: 'text', text: msg.content }],
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
  input_schema: Record<string, unknown>
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
  const chatId = interactionId || generateId()
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

  const eventQueue: GumloopEvent[] = []
  let resolveNext: ((value: IteratorResult<GumloopEvent>) => void) | null = null
  let finished = false
  let error: Error | null = null

  ws.on('open', () => {
    ws.send(JSON.stringify(payload))
  })

  ws.on('message', (data) => {
    try {
      const event = JSON.parse(data.toString()) as GumloopEvent
      if (resolveNext) {
        resolveNext({ value: event, done: false })
        resolveNext = null
      } else {
        eventQueue.push(event)
      }
      if (event.type === 'finish') {
        finished = true
        ws.close()
      }
    } catch {
      // ignore parse errors
    }
  })

  ws.on('error', (err) => {
    error = err
    if (resolveNext) {
      resolveNext({ value: undefined as unknown as GumloopEvent, done: true })
      resolveNext = null
    }
  })

  ws.on('close', () => {
    finished = true
    if (resolveNext) {
      resolveNext({ value: undefined as unknown as GumloopEvent, done: true })
      resolveNext = null
    }
  })

  while (!finished || eventQueue.length > 0) {
    if (error) throw error

    if (eventQueue.length > 0) {
      const event = eventQueue.shift()!
      yield event
      if (event.type === 'finish') break
    } else if (!finished) {
      const event = await new Promise<IteratorResult<GumloopEvent>>((resolve) => {
        resolveNext = resolve
      })
      if (event.done) break
      yield event.value
      if (event.value.type === 'finish') break
    }
  }
}

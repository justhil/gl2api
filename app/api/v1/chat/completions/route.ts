import { NextRequest, NextResponse } from 'next/server'
import { ChatCompletionRequestSchema } from '@/lib/gumloop/types'
import { verifyApiKey } from '@/lib/utils/api-key'
import { mapModel } from '@/lib/utils/model-map'
import { getEnabledAccount } from '@/lib/db/accounts'
import { getToken } from '@/lib/cache/token'
import { sendChat } from '@/lib/gumloop/client'
import { GumloopStreamHandler } from '@/lib/gumloop/handler'
import { buildOpenAIChunk, buildOpenAIDone } from '@/lib/gumloop/parser'

export const runtime = 'nodejs'
export const maxDuration = 60

function generateId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = 'chatcmpl-'
  for (let i = 0; i < 24; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}

function convertMessages(messages: Array<{ role: string; content?: unknown }>): Array<{ role: string; content: string }> {
  return messages.map((msg) => {
    let content = msg.content
    if (Array.isArray(content)) {
      content = content
        .filter((b): b is { type: string; text?: string } => typeof b === 'object' && b?.type === 'text')
        .map((b) => b.text || '')
        .join('\n')
    }
    return { role: msg.role, content: String(content || '') }
  })
}

export async function POST(req: NextRequest) {
  const { valid } = verifyApiKey(req)
  if (!valid) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = ChatCompletionRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.issues }, { status: 400 })
  }

  const data = parsed.data
  const account = await getEnabledAccount()
  if (!account?.refreshToken || !account.gummieId) {
    return NextResponse.json({ error: 'No enabled account configured' }, { status: 500 })
  }

  let idToken: string
  try {
    const tokenData = await getToken(account.id, account.refreshToken)
    idToken = tokenData.idToken
  } catch (err) {
    return NextResponse.json({ error: 'Authentication failed', details: String(err) }, { status: 500 })
  }

  const messages = convertMessages(data.messages)
  const model = mapModel(data.model || 'gpt-4')
  const streamId = generateId()
  const created = Math.floor(Date.now() / 1000)

  if (data.stream) {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const handler = new GumloopStreamHandler(model)
          controller.enqueue(encoder.encode(buildOpenAIChunk(streamId, model, { role: 'assistant', created })))

          for await (const event of sendChat(account.gummieId!, messages, idToken)) {
            const ev = handler.handleEvent(event)
            if (ev.type === 'text_delta' && ev.delta) {
              controller.enqueue(encoder.encode(buildOpenAIChunk(streamId, model, { content: ev.delta, created })))
            } else if (ev.type === 'finish') {
              controller.enqueue(encoder.encode(buildOpenAIChunk(streamId, model, { finishReason: 'stop', created })))
              controller.enqueue(encoder.encode(buildOpenAIDone()))
              break
            }
          }
        } catch (err) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`))
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  }

  const handler = new GumloopStreamHandler(model)
  for await (const event of sendChat(account.gummieId, messages, idToken)) {
    handler.handleEvent(event)
  }

  return NextResponse.json({
    id: streamId,
    object: 'chat.completion',
    created,
    model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: handler.getFullText() },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: handler.inputTokens,
      completion_tokens: handler.outputTokens,
      total_tokens: handler.inputTokens + handler.outputTokens,
    },
  })
}

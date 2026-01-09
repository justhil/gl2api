import { NextRequest, NextResponse } from 'next/server'
import { ResponsesRequestSchema } from '@/lib/gumloop/types'
import { verifyApiKey } from '@/lib/utils/api-key'
import { mapModel } from '@/lib/utils/model-map'
import { getEnabledAccount } from '@/lib/db/accounts'
import { getToken } from '@/lib/cache/token'
import { sendChat } from '@/lib/gumloop/client'
import { GumloopStreamHandler } from '@/lib/gumloop/handler'

export const runtime = 'nodejs'
export const maxDuration = 60

function generateId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = 'resp_'
  for (let i = 0; i < 24; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}

export async function POST(req: NextRequest) {
  const { valid } = verifyApiKey(req)
  if (!valid) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = ResponsesRequestSchema.safeParse(body)
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

  let inputText: string
  if (typeof data.input === 'string') {
    inputText = data.input
  } else {
    inputText = data.input
      .filter((p): p is { type: string; text?: string } => typeof p === 'object' && p?.type === 'text')
      .map((p) => p.text || '')
      .join('\n')
  }

  const messages: Array<{ role: string; content: string }> = []
  if (data.instructions) {
    messages.push({ role: 'user', content: `[Instructions]: ${data.instructions}` })
  }
  messages.push({ role: 'user', content: inputText })

  const model = mapModel(data.model || 'gpt-4')
  const respId = generateId()

  if (data.stream) {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const handler = new GumloopStreamHandler(model)

          for await (const event of sendChat(account.gummieId!, messages, idToken)) {
            const ev = handler.handleEvent(event)
            if (ev.type === 'text_delta' && ev.delta) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'content_part_delta', delta: { text: ev.delta } })}\n\n`)
              )
            } else if (ev.type === 'finish') {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'response_done',
                    response: { id: respId, output: [{ type: 'text', text: handler.getFullText() }] },
                  })}\n\n`
                )
              )
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
    id: respId,
    object: 'response',
    model,
    output: [{ type: 'text', text: handler.getFullText() }],
    usage: { input_tokens: handler.inputTokens, output_tokens: handler.outputTokens },
  })
}

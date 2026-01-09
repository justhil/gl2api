import { NextRequest, NextResponse } from 'next/server'
import { GeminiRequestSchema } from '@/lib/gumloop/types'
import { verifyApiKey } from '@/lib/utils/api-key'
import { mapModel } from '@/lib/utils/model-map'
import { getEnabledAccount } from '@/lib/db/accounts'
import { getToken } from '@/lib/cache/token'
import { sendChat } from '@/lib/gumloop/client'
import { GumloopStreamHandler } from '@/lib/gumloop/handler'
import { buildGeminiStreamChunk } from '@/lib/gumloop/parser'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest, { params }: { params: Promise<{ model: string }> }) {
  const { valid } = verifyApiKey(req)
  if (!valid) {
    return NextResponse.json({ error: { code: 401, message: 'Invalid API key' } }, { status: 401 })
  }

  const { model: modelParam } = await params
  const body = await req.json()
  const parsed = GeminiRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: { code: 400, message: parsed.error.message } }, { status: 400 })
  }

  const data = parsed.data
  const account = await getEnabledAccount()
  if (!account?.refreshToken || !account.gummieId) {
    return NextResponse.json({ error: { code: 500, message: 'No enabled account configured' } }, { status: 500 })
  }

  let idToken: string
  try {
    const tokenData = await getToken(account.id, account.refreshToken)
    idToken = tokenData.idToken
  } catch (err) {
    return NextResponse.json({ error: { code: 500, message: `Authentication failed: ${err}` } }, { status: 500 })
  }

  const messages: Array<{ role: string; content: string }> = []
  for (const content of data.contents) {
    const role = content.role || 'user'
    const text = content.parts
      .filter((p) => p.text)
      .map((p) => p.text)
      .join('\n')
    messages.push({ role, content: text })
  }

  const model = mapModel(modelParam)
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const handler = new GumloopStreamHandler(model)

        for await (const event of sendChat(account.gummieId!, messages, idToken)) {
          const ev = handler.handleEvent(event)
          if (ev.type === 'text_delta' && ev.delta) {
            controller.enqueue(encoder.encode(buildGeminiStreamChunk(ev.delta)))
          }
        }
      } catch (err) {
        controller.enqueue(encoder.encode(JSON.stringify({ error: String(err) }) + '\n'))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

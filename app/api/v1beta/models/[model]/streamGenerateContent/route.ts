import { NextRequest, NextResponse } from 'next/server'
import { GeminiRequestSchema } from '@/lib/gumloop/types'
import { verifyApiKey } from '@/lib/utils/api-key'
import { mapModel } from '@/lib/utils/model-map'
import { getEnabledAccount } from '@/lib/db/accounts'
import { getToken } from '@/lib/cache/token'
import { sendChat, generateChatId, type Message } from '@/lib/gumloop/client'
import { GumloopStreamHandler } from '@/lib/gumloop/handler'
import { buildGeminiStreamChunk } from '@/lib/gumloop/parser'
import { extractGeminiFile, uploadFile, createFilePart, type FilePart } from '@/lib/gumloop/file'

export const runtime = 'nodejs'
export const maxDuration = 60

interface ExtractedMessage {
  role: string
  content: string
  files?: Array<{ base64Data: string; mediaType: string }>
}

async function processFilesInMessages(
  extractedMessages: ExtractedMessage[],
  chatId: string,
  userId: string,
  idToken: string
): Promise<Message[]> {
  const result: Message[] = []

  for (const msg of extractedMessages) {
    const message: Message = {
      role: msg.role,
      content: msg.content,
    }

    if (msg.files?.length) {
      const fileParts: FilePart[] = []
      for (const f of msg.files) {
        const uploaded = await uploadFile(f.base64Data, f.mediaType, chatId, userId, idToken)
        fileParts.push(createFilePart(uploaded))
      }
      message.files = fileParts
    }

    result.push(message)
  }

  return result
}

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
  let userId: string
  try {
    const tokenData = await getToken(account.id, account.refreshToken)
    idToken = tokenData.idToken
    userId = tokenData.userId
  } catch (err) {
    return NextResponse.json({ error: { code: 500, message: `Authentication failed: ${err}` } }, { status: 500 })
  }

  const extractedMessages: ExtractedMessage[] = []
  for (const content of data.contents) {
    const role = content.role || 'user'
    const textParts: string[] = []
    const files: Array<{ base64Data: string; mediaType: string }> = []

    for (const part of content.parts) {
      if (part.text) {
        textParts.push(part.text)
      } else {
        const file = extractGeminiFile(part)
        if (file) {
          files.push(file)
        }
      }
    }

    extractedMessages.push({
      role,
      content: textParts.join('\n'),
      files: files.length > 0 ? files : undefined,
    })
  }

  const model = mapModel(modelParam)
  const chatId = generateChatId()
  const messages = await processFilesInMessages(extractedMessages, chatId, userId, idToken)
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const handler = new GumloopStreamHandler(model)

        for await (const event of sendChat(account.gummieId!, messages, idToken, chatId)) {
          const ev = handler.handleEvent(event)
          if (ev.type === 'reasoning_delta' && ev.delta) {
            controller.enqueue(encoder.encode(buildGeminiStreamChunk(ev.delta, true)))
          } else if (ev.type === 'text_delta' && ev.delta) {
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

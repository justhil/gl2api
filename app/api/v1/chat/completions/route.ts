import { NextRequest, NextResponse } from 'next/server'
import { ChatCompletionRequestSchema } from '@/lib/gumloop/types'
import { verifyApiKey } from '@/lib/utils/api-key'
import { mapModel } from '@/lib/utils/model-map'
import { getEnabledAccount, getGummieIdForModel } from '@/lib/db/accounts'
import { getToken } from '@/lib/cache/token'
import { sendChat, generateChatId, type Message } from '@/lib/gumloop/client'
import { GumloopStreamHandler } from '@/lib/gumloop/handler'
import { buildOpenAIChunk, buildOpenAIDone } from '@/lib/gumloop/parser'
import { extractOpenAIImage, uploadImage, createImagePart, type ImagePart } from '@/lib/gumloop/image'

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

interface ExtractedMessage {
  role: string
  content: string
  images?: Array<{ base64Data: string; mediaType: string }>
}

function convertMessages(messages: Array<{ role: string; content?: unknown }>): ExtractedMessage[] {
  return messages.map((msg) => {
    const content = msg.content
    const images: Array<{ base64Data: string; mediaType: string }> = []

    if (Array.isArray(content)) {
      const textParts: string[] = []
      for (const block of content) {
        if (typeof block === 'object' && block?.type === 'text' && block.text) {
          textParts.push(block.text)
        } else {
          const img = extractOpenAIImage(block)
          if (img) {
            images.push(img)
          }
        }
      }
      return {
        role: msg.role,
        content: textParts.join('\n'),
        images: images.length > 0 ? images : undefined,
      }
    }

    return { role: msg.role, content: String(content || '') }
  })
}

async function processImagesInMessages(
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

    if (msg.images?.length) {
      const imageParts: ImagePart[] = []
      for (const img of msg.images) {
        const uploaded = await uploadImage(img.base64Data, img.mediaType, chatId, userId, idToken)
        imageParts.push(createImagePart(uploaded))
      }
      message.images = imageParts
    }

    result.push(message)
  }

  return result
}

export async function POST(req: NextRequest) {
  console.log('[chat/completions] request received')
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
  const model = mapModel(data.model || 'gpt-4')

  const account = await getEnabledAccount()
  if (!account?.refreshToken) {
    return NextResponse.json({ error: 'No enabled account configured' }, { status: 500 })
  }

  // 根据模型选择对应的 gummie
  const gummieId = getGummieIdForModel(account, model)
  if (!gummieId) {
    return NextResponse.json({ error: `No gummie configured for model: ${model}` }, { status: 500 })
  }

  let idToken: string
  let userId: string
  try {
    const tokenData = await getToken(account.id, account.refreshToken)
    idToken = tokenData.idToken
    userId = tokenData.userId
  } catch (err) {
    return NextResponse.json({ error: 'Authentication failed', details: String(err) }, { status: 500 })
  }

  const extractedMessages = convertMessages(data.messages)
  const chatId = generateChatId()
  const messages = await processImagesInMessages(extractedMessages, chatId, userId, idToken)
  const streamId = generateId()
  const created = Math.floor(Date.now() / 1000)

  if (data.stream) {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const handler = new GumloopStreamHandler(model)
          controller.enqueue(encoder.encode(buildOpenAIChunk(streamId, model, { role: 'assistant', created })))

          for await (const event of sendChat(gummieId, messages, idToken, chatId)) {
            const ev = handler.handleEvent(event)
            if (ev.type === 'reasoning_delta' && ev.delta) {
              controller.enqueue(encoder.encode(buildOpenAIChunk(streamId, model, { reasoningContent: ev.delta, created })))
            } else if (ev.type === 'text_delta' && ev.delta) {
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
  for await (const event of sendChat(gummieId, messages, idToken, chatId)) {
    handler.handleEvent(event)
  }

  const message: Record<string, unknown> = { role: 'assistant', content: handler.getFullText() }
  const reasoning = handler.getFullReasoning()
  if (reasoning) {
    message.reasoning_content = reasoning
  }

  return NextResponse.json({
    id: streamId,
    object: 'chat.completion',
    created,
    model,
    choices: [
      {
        index: 0,
        message,
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

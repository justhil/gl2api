import { NextRequest, NextResponse } from 'next/server'
import { ClaudeRequestSchema } from '@/lib/gumloop/types'
import { verifyApiKey } from '@/lib/utils/api-key'
import { mapModel } from '@/lib/utils/model-map'
import { getEnabledAccount, getGummieIdForModel } from '@/lib/db/accounts'
import { getToken } from '@/lib/cache/token'
import { sendChat, updateGummieConfig, type Message } from '@/lib/gumloop/client'
import { GumloopStreamHandler } from '@/lib/gumloop/handler'
import {
  buildMessageStart,
  buildContentBlockStart,
  buildContentBlockDelta,
  buildContentBlockStop,
  buildPing,
  buildMessageDelta,
  buildMessageStop,
  buildToolUseStart,
  buildToolUseDelta,
} from '@/lib/gumloop/parser'
import {
  convertMessagesSimple,
  convertMessagesWithTools,
  parseToolCalls,
  detectToolLoop,
  type ConvertedMessage,
} from '@/lib/gumloop/tools'
import { uploadImage, createImagePart, type ImagePart } from '@/lib/gumloop/image'

export const runtime = 'nodejs'
export const maxDuration = 60

function generateMsgId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = 'msg_'
  for (let i = 0; i < 24; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}

export async function POST(req: NextRequest) {
  const { valid } = verifyApiKey(req)
  if (!valid) {
    return NextResponse.json({ error: { type: 'authentication_error', message: 'Invalid API key' } }, { status: 401 })
  }

  const body = await req.json()
  const parsed = ClaudeRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: { type: 'invalid_request_error', message: parsed.error.message } }, { status: 400 })
  }

  const data = parsed.data
  const model = mapModel(data.model)

  const account = await getEnabledAccount()
  if (!account?.refreshToken) {
    return NextResponse.json({ error: { type: 'api_error', message: 'No enabled account configured' } }, { status: 500 })
  }

  // 根据模型选择对应的 gummie
  const gummieId = getGummieIdForModel(account, model)
  if (!gummieId) {
    return NextResponse.json({ error: { type: 'api_error', message: `No gummie configured for model: ${model}` } }, { status: 500 })
  }

  let idToken: string
  let userId: string
  try {
    const tokenData = await getToken(account.id, account.refreshToken)
    idToken = tokenData.idToken
    userId = tokenData.userId
  } catch (err) {
    return NextResponse.json({ error: { type: 'api_error', message: `Authentication failed: ${err}` } }, { status: 500 })
  }

  // Check for tool loops
  const hasTools = Boolean(data.tools?.length)
  if (hasTools) {
    const loopError = detectToolLoop(data.messages.map((m) => ({ role: m.role, content: m.content })))
    if (loopError) {
      return NextResponse.json({ error: { type: 'invalid_request_error', message: loopError } }, { status: 400 })
    }
  }

  // Extract system prompt
  let systemText: string | undefined
  if (data.system) {
    if (typeof data.system === 'string') {
      systemText = data.system
    } else {
      systemText = data.system
        .filter((b): b is { type: string; text?: string } => typeof b === 'object' && b?.type === 'text')
        .map((b) => b.text || '')
        .join('\n')
    }
  }

  // Update gummie config if needed
  if (data.tools || data.system) {
    try {
      await updateGummieConfig(gummieId, userId, idToken, {
        systemPrompt: systemText,
        tools: data.tools?.map((t) => ({
          name: t.name,
          description: t.description || '',
          input_schema: t.input_schema,
        })),
        modelName: model,
      })
    } catch {
      // Fallback to text-based tools
      const convertedMessages = convertMessagesWithTools(
        data.messages.map((m) => ({ role: m.role, content: m.content })),
        data.tools,
        systemText
      )
      const messages = await processImagesInMessages(convertedMessages, gummieId, userId, idToken)
      return processChat(gummieId, messages, model, data, hasTools, idToken)
    }
  }

  const convertedMessages = convertMessagesSimple(data.messages.map((m) => ({ role: m.role, content: m.content })))
  const messages = await processImagesInMessages(convertedMessages, gummieId, userId, idToken)
  return processChat(gummieId, messages, model, data, hasTools, idToken)
}

async function processImagesInMessages(
  convertedMessages: ConvertedMessage[],
  chatId: string,
  userId: string,
  idToken: string
): Promise<Message[]> {
  const result: Message[] = []

  for (const msg of convertedMessages) {
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

async function processChat(
  gummieId: string,
  messages: Message[],
  model: string,
  data: { stream: boolean; thinking?: Record<string, unknown> },
  hasTools: boolean,
  idToken: string
) {
  const msgId = generateMsgId()
  const thinkingEnabled = data.thinking?.type === 'enabled'

  if (data.stream) {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const handler = new GumloopStreamHandler(model)
          controller.enqueue(encoder.encode(buildMessageStart(msgId, model, 0)))
          controller.enqueue(encoder.encode(buildPing()))

          let blockIdx = 0
          let inThinking = false
          let inText = false
          let fullText = ''

          for await (const event of sendChat(gummieId, messages, idToken)) {
            const ev = handler.handleEvent(event)

            if (ev.type === 'reasoning_start' && thinkingEnabled) {
              controller.enqueue(encoder.encode(buildContentBlockStart(blockIdx, 'thinking')))
              inThinking = true
            } else if (ev.type === 'reasoning_delta' && ev.delta && thinkingEnabled) {
              if (!inThinking) {
                controller.enqueue(encoder.encode(buildContentBlockStart(blockIdx, 'thinking')))
                inThinking = true
              }
              controller.enqueue(encoder.encode(buildContentBlockDelta(blockIdx, ev.delta, 'thinking_delta', 'thinking')))
            } else if (ev.type === 'reasoning_end' && thinkingEnabled) {
              if (inThinking) {
                controller.enqueue(encoder.encode(buildContentBlockStop(blockIdx)))
                blockIdx++
                inThinking = false
              }
            } else if (ev.type === 'text_start') {
              controller.enqueue(encoder.encode(buildContentBlockStart(blockIdx, 'text')))
              inText = true
            } else if (ev.type === 'text_delta' && ev.delta) {
              if (!inText) {
                controller.enqueue(encoder.encode(buildContentBlockStart(blockIdx, 'text')))
                inText = true
              }
              fullText += ev.delta
              controller.enqueue(encoder.encode(buildContentBlockDelta(blockIdx, ev.delta)))
            } else if (ev.type === 'text_end') {
              if (inText) {
                controller.enqueue(encoder.encode(buildContentBlockStop(blockIdx)))
                blockIdx++
                inText = false
              }
            } else if (ev.type === 'finish') {
              if (inThinking) {
                controller.enqueue(encoder.encode(buildContentBlockStop(blockIdx)))
                blockIdx++
              }
              if (inText) {
                controller.enqueue(encoder.encode(buildContentBlockStop(blockIdx)))
                blockIdx++
              }

              let stopReason = 'end_turn'
              if (hasTools) {
                const { toolUses } = parseToolCalls(fullText)
                if (toolUses.length) {
                  stopReason = 'tool_use'
                  for (const tu of toolUses) {
                    controller.enqueue(encoder.encode(buildToolUseStart(blockIdx, tu.id, tu.name)))
                    controller.enqueue(encoder.encode(buildToolUseDelta(blockIdx, JSON.stringify(tu.input))))
                    controller.enqueue(encoder.encode(buildContentBlockStop(blockIdx)))
                    blockIdx++
                  }
                }
              }

              controller.enqueue(encoder.encode(buildMessageDelta(ev.usage?.output_tokens || 0, stopReason)))
              controller.enqueue(encoder.encode(buildMessageStop()))
              break
            }
          }
        } catch (err) {
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: String(err) })}\n\n`))
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

  // Non-streaming
  const handler = new GumloopStreamHandler(model)
  for await (const event of sendChat(gummieId, messages, idToken)) {
    handler.handleEvent(event)
  }

  const fullText = handler.getFullText()
  const content: Array<Record<string, unknown>> = []
  let stopReason = 'end_turn'

  if (thinkingEnabled && handler.getFullReasoning()) {
    content.push({ type: 'thinking', thinking: handler.getFullReasoning() })
  }

  if (hasTools) {
    const { remainingText, toolUses } = parseToolCalls(fullText)
    if (remainingText) {
      content.push({ type: 'text', text: remainingText })
    }
    if (toolUses.length) {
      stopReason = 'tool_use'
      for (const tu of toolUses) {
        content.push({ ...tu })
      }
    }
  } else {
    content.push({ type: 'text', text: fullText })
  }

  return NextResponse.json({
    id: msgId,
    type: 'message',
    role: 'assistant',
    model,
    content,
    stop_reason: stopReason,
    usage: { input_tokens: handler.inputTokens, output_tokens: handler.outputTokens },
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { ClaudeRequestSchema } from '@/lib/gumloop/types'
import { verifyApiKey } from '@/lib/utils/api-key'
import { mapModel } from '@/lib/utils/model-map'
import { getEnabledAccount, getGummieIdForModel } from '@/lib/db/accounts'
import { getToken } from '@/lib/cache/token'
import { sendChat, generateChatId, type Message } from '@/lib/gumloop/client'
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
import { uploadFile, createFilePart } from '@/lib/gumloop/file'
import { recordRequest } from '@/lib/db/stats'

export const runtime = 'nodejs'

// 复用 TextEncoder 减少 GC
const encoder = new TextEncoder()

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

  const chatId = generateChatId()

  // 工具定义通过消息文本传递（Gumloop 网页端的方式）
  // 不使用 REST API 配置工具，而是将工具定义嵌入到用户消息中
  const convertedMessages = hasTools || systemText
    ? convertMessagesWithTools(
        data.messages.map((m) => ({ role: m.role, content: m.content })),
        data.tools,
        systemText
      )
    : convertMessagesSimple(data.messages.map((m) => ({ role: m.role, content: m.content })))

  const messages = await processFilesInMessages(convertedMessages, chatId, userId, idToken)
  return processChat(gummieId, messages, model, data, hasTools, idToken, chatId)
}

async function processFilesInMessages(
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

    if (msg.files?.length) {
      const uploadedFiles = await Promise.all(
        msg.files.map(f => uploadFile(f.base64Data, f.mediaType, chatId, userId, idToken, f.filename))
      )
      message.files = uploadedFiles.map(createFilePart)
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
  idToken: string,
  chatId: string
) {
  const msgId = generateMsgId()
  const thinkingEnabled = data.thinking?.type === 'enabled'

  if (data.stream) {
    const stream = new ReadableStream({
      async start(controller) {
        const handler = new GumloopStreamHandler(model)
        const write = (s: string) => controller.enqueue(encoder.encode(s))

        try {
          write(buildMessageStart(msgId, model, 0))
          write(buildPing())

          let blockIdx = 0
          let inThinking = false
          let inText = false
          let fullText = ''
          // 当有 tools 时，需要缓冲文本以过滤 <tool_use> 块
          let textBuffer = ''
          let inToolUseXml = false

          for await (const event of sendChat(gummieId, messages, idToken, chatId)) {
            const ev = handler.handleEvent(event)

            if (ev.type === 'reasoning_start' && thinkingEnabled) {
              write(buildContentBlockStart(blockIdx, 'thinking'))
              inThinking = true
            } else if (ev.type === 'reasoning_delta' && ev.delta && thinkingEnabled) {
              if (!inThinking) {
                write(buildContentBlockStart(blockIdx, 'thinking'))
                inThinking = true
              }
              write(buildContentBlockDelta(blockIdx, ev.delta, 'thinking_delta', 'thinking'))
            } else if (ev.type === 'reasoning_end' && thinkingEnabled) {
              if (inThinking) {
                write(buildContentBlockStop(blockIdx))
                blockIdx++
                inThinking = false
              }
            } else if (ev.type === 'text_start') {
              if (!hasTools) {
                write(buildContentBlockStart(blockIdx, 'text'))
                inText = true
              }
            } else if (ev.type === 'text_delta' && ev.delta) {
              fullText += ev.delta

              if (hasTools) {
                textBuffer += ev.delta

                const toolUseStart = textBuffer.indexOf('<tool_use')
                if (toolUseStart !== -1 && !inToolUseXml) {
                  const beforeToolUse = textBuffer.substring(0, toolUseStart)
                  if (beforeToolUse) {
                    if (!inText) {
                      write(buildContentBlockStart(blockIdx, 'text'))
                      inText = true
                    }
                    write(buildContentBlockDelta(blockIdx, beforeToolUse))
                  }
                  textBuffer = textBuffer.substring(toolUseStart)
                  inToolUseXml = true
                }

                if (inToolUseXml) {
                  const toolUseEnd = textBuffer.indexOf('</tool_use>')
                  if (toolUseEnd !== -1) {
                    textBuffer = textBuffer.substring(toolUseEnd + '</tool_use>'.length)
                    inToolUseXml = false
                  }
                }

                if (!inToolUseXml && textBuffer) {
                  const safeEnd = textBuffer.lastIndexOf('<')
                  if (safeEnd > 0) {
                    const safeText = textBuffer.substring(0, safeEnd)
                    if (safeText) {
                      if (!inText) {
                        write(buildContentBlockStart(blockIdx, 'text'))
                        inText = true
                      }
                      write(buildContentBlockDelta(blockIdx, safeText))
                    }
                    textBuffer = textBuffer.substring(safeEnd)
                  }
                }
              } else {
                if (!inText) {
                  write(buildContentBlockStart(blockIdx, 'text'))
                  inText = true
                }
                write(buildContentBlockDelta(blockIdx, ev.delta))
              }
            } else if (ev.type === 'text_end') {
              if (hasTools && textBuffer && !inToolUseXml) {
                if (!inText) {
                  write(buildContentBlockStart(blockIdx, 'text'))
                  inText = true
                }
                write(buildContentBlockDelta(blockIdx, textBuffer))
                textBuffer = ''
              }
              if (inText) {
                write(buildContentBlockStop(blockIdx))
                blockIdx++
                inText = false
              }
            } else if (ev.type === 'finish') {
              console.log('[SSE] Received finish event, sending end signals')
              if (inThinking) {
                write(buildContentBlockStop(blockIdx))
                blockIdx++
              }
              if (inText) {
                write(buildContentBlockStop(blockIdx))
                blockIdx++
              }

              let stopReason = 'end_turn'
              if (hasTools) {
                const { toolUses } = parseToolCalls(fullText)
                if (toolUses.length) {
                  stopReason = 'tool_use'
                  for (const tu of toolUses) {
                    write(buildToolUseStart(blockIdx, tu.id, tu.name))
                    write(buildToolUseDelta(blockIdx, JSON.stringify(tu.input)))
                    write(buildContentBlockStop(blockIdx))
                    blockIdx++
                  }
                }
              }

              write(buildMessageDelta(ev.usage?.output_tokens || 0, stopReason))
              write(buildMessageStop())
              console.log('[SSE] End signals sent, breaking loop')
              break
            }
          }

          if (!handler.finished) {
            if (inThinking) {
              write(buildContentBlockStop(blockIdx))
              blockIdx++
            }
            if (inText) {
              write(buildContentBlockStop(blockIdx))
              blockIdx++
            }
            write(buildMessageDelta(0, 'end_turn'))
            write(buildMessageStop())
          }
          recordRequest(model, handler.inputTokens, handler.outputTokens).catch(() => {})
        } catch (err) {
          console.error('[SSE] Error:', err)
          write(`event: error\ndata: ${JSON.stringify({ error: String(err) })}\n\n`)
        } finally {
          console.log('[SSE] Closing controller')
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
  for await (const event of sendChat(gummieId, messages, idToken, chatId)) {
    handler.handleEvent(event)
  }

  recordRequest(model, handler.inputTokens, handler.outputTokens).catch(() => {})

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

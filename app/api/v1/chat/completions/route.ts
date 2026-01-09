import { NextRequest, NextResponse } from 'next/server'
import { ChatCompletionRequestSchema } from '@/lib/gumloop/types'
import { verifyApiKey } from '@/lib/utils/api-key'
import { mapModel } from '@/lib/utils/model-map'
import { getEnabledAccount, getGummieIdForModel } from '@/lib/db/accounts'
import { getToken } from '@/lib/cache/token'
import { sendChat, generateChatId, type Message } from '@/lib/gumloop/client'
import { GumloopStreamHandler } from '@/lib/gumloop/handler'
import { buildOpenAIChunk, buildOpenAIDone } from '@/lib/gumloop/parser'
import { extractOpenAIImage, extractOpenAIFile, uploadFile, createFilePart } from '@/lib/gumloop/file'
import { convertMessagesWithOpenAITools } from '@/lib/gumloop/openai'
import { parseToolCalls } from '@/lib/gumloop/tools'
import { recordRequest } from '@/lib/db/stats'

export const runtime = 'nodejs'

// 复用 TextEncoder 减少 GC
const encoder = new TextEncoder()

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
  files?: Array<{ base64Data: string; mediaType: string; filename?: string }>
}

function convertMessages(messages: Array<{ role: string; content?: unknown }>): ExtractedMessage[] {
  return messages.map((msg) => {
    const content = msg.content
    const files: Array<{ base64Data: string; mediaType: string; filename?: string }> = []

    if (Array.isArray(content)) {
      const textParts: string[] = []
      for (const block of content) {
        if (typeof block === 'object' && block?.type === 'text' && block.text) {
          textParts.push(block.text)
        } else {
          const img = extractOpenAIImage(block)
          if (img) {
            files.push(img)
          } else {
            const file = extractOpenAIFile(block)
            if (file) {
              files.push(file)
            }
          }
        }
      }
      return {
        role: msg.role,
        content: textParts.join('\n'),
        files: files.length > 0 ? files : undefined,
      }
    }

    return { role: msg.role, content: String(content || '') }
  })
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
      const uploadedFiles = await Promise.all(
        msg.files.map(f => uploadFile(f.base64Data, f.mediaType, chatId, userId, idToken, f.filename))
      )
      message.files = uploadedFiles.map(createFilePart)
    }

    result.push(message)
  }

  return result
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

  // 转换 OpenAI 格式的工具和消息为内部格式
  const { convertedMessages, hasTools } = convertMessagesWithOpenAITools(
    data.messages,
    data.tools
  )

  const extractedMessages = convertMessages(convertedMessages)
  const chatId = generateChatId()
  const messages = await processFilesInMessages(extractedMessages, chatId, userId, idToken)
  const streamId = generateId()
  const created = Math.floor(Date.now() / 1000)

  if (data.stream) {
    const stream = new ReadableStream({
      async start(controller) {
        const handler = new GumloopStreamHandler(model)
        const write = (s: string) => controller.enqueue(encoder.encode(s))

        try {
          write(buildOpenAIChunk(streamId, model, { role: 'assistant', created }))

          let fullText = ''
          for await (const event of sendChat(gummieId, messages, idToken, chatId)) {
            const ev = handler.handleEvent(event)
            if (ev.type === 'reasoning_delta' && ev.delta) {
              write(buildOpenAIChunk(streamId, model, { reasoningContent: ev.delta, created }))
            } else if (ev.type === 'text_delta' && ev.delta) {
              fullText += ev.delta
              write(buildOpenAIChunk(streamId, model, { content: ev.delta, created }))
            } else if (ev.type === 'finish') {
              // 检查是否包含工具调用
              if (hasTools) {
                const { toolUses } = parseToolCalls(fullText)
                if (toolUses.length > 0) {
                  // 发送工具调用完成标记
                  const toolCalls = toolUses.map((tool, index) => ({
                    index,
                    id: tool.id,
                    type: 'function',
                    function: {
                      name: tool.name,
                      arguments: JSON.stringify(tool.input)
                    }
                  }))
                  write(buildOpenAIChunk(streamId, model, { toolCalls, finishReason: 'tool_calls', created }))
                } else {
                  write(buildOpenAIChunk(streamId, model, { finishReason: 'stop', created }))
                }
              } else {
                write(buildOpenAIChunk(streamId, model, { finishReason: 'stop', created }))
              }
              write(buildOpenAIDone())
              break
            }
          }

          if (!handler.finished) {
            write(buildOpenAIChunk(streamId, model, { finishReason: 'stop', created }))
            write(buildOpenAIDone())
          }
          recordRequest(model, handler.inputTokens, handler.outputTokens).catch(() => {})
        } catch (err) {
          write(`data: ${JSON.stringify({ error: String(err) })}\n\n`)
        }
        controller.close()
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

  recordRequest(model, handler.inputTokens, handler.outputTokens).catch(() => {})

  const fullText = handler.getFullText()
  const message: Record<string, unknown> = { role: 'assistant', content: fullText }
  const reasoning = handler.getFullReasoning()
  if (reasoning) {
    message.reasoning_content = reasoning
  }

  let finishReason = 'stop'

  // 检查是否包含工具调用
  if (hasTools) {
    const { toolUses, remainingText } = parseToolCalls(fullText)
    if (toolUses.length > 0) {
      message.content = remainingText
      message.tool_calls = toolUses.map((tool, index) => ({
        index,
        id: tool.id,
        type: 'function',
        function: {
          name: tool.name,
          arguments: JSON.stringify(tool.input),
        },
      }))
      finishReason = 'tool_calls'
    }
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
        finish_reason: finishReason,
      },
    ],
    usage: {
      prompt_tokens: handler.inputTokens,
      completion_tokens: handler.outputTokens,
      total_tokens: handler.inputTokens + handler.outputTokens,
    },
  })
}

// SSE format builders for different API formats

// ============ Claude Messages API ============

export function buildMessageStart(msgId: string, model: string, inputTokens: number): string {
  return `event: message_start\ndata: ${JSON.stringify({
    type: 'message_start',
    message: {
      id: msgId,
      type: 'message',
      role: 'assistant',
      model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: inputTokens, output_tokens: 0 },
    },
  })}\n\n`
}

export function buildContentBlockStart(index: number, blockType: 'text' | 'thinking' | 'tool_use', extra?: Record<string, unknown>): string {
  const block: Record<string, unknown> = { type: blockType, ...extra }
  if (blockType === 'text') block.text = ''
  if (blockType === 'thinking') block.thinking = ''
  return `event: content_block_start\ndata: ${JSON.stringify({
    type: 'content_block_start',
    index,
    content_block: block,
  })}\n\n`
}

export function buildContentBlockDelta(
  index: number,
  delta: string,
  deltaType: 'text_delta' | 'thinking_delta' | 'input_json_delta' = 'text_delta',
  key = 'text'
): string {
  const deltaObj: Record<string, unknown> = { type: deltaType }
  if (deltaType === 'input_json_delta') {
    deltaObj.partial_json = delta
  } else {
    deltaObj[key] = delta
  }
  return `event: content_block_delta\ndata: ${JSON.stringify({
    type: 'content_block_delta',
    index,
    delta: deltaObj,
  })}\n\n`
}

export function buildContentBlockStop(index: number): string {
  return `event: content_block_stop\ndata: ${JSON.stringify({
    type: 'content_block_stop',
    index,
  })}\n\n`
}

export function buildPing(): string {
  return `event: ping\ndata: {"type": "ping"}\n\n`
}

export function buildMessageDelta(outputTokens: number, stopReason = 'end_turn'): string {
  return `event: message_delta\ndata: ${JSON.stringify({
    type: 'message_delta',
    delta: { stop_reason: stopReason, stop_sequence: null },
    usage: { output_tokens: outputTokens },
  })}\n\n`
}

export function buildMessageStop(): string {
  return `event: message_stop\ndata: {"type": "message_stop"}\n\n`
}

export function buildToolUseStart(index: number, toolId: string, name: string): string {
  return buildContentBlockStart(index, 'tool_use', { id: toolId, name, input: {} })
}

export function buildToolUseDelta(index: number, partialJson: string): string {
  return buildContentBlockDelta(index, partialJson, 'input_json_delta')
}

// ============ OpenAI Chat Completions API ============

export function buildOpenAIChunk(
  id: string,
  model: string,
  options: {
    role?: string
    content?: string
    reasoningContent?: string
    toolCalls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>
    finishReason?: string | null
    created?: number
  } = {}
): string {
  const { role, content, reasoningContent, toolCalls, finishReason, created = Math.floor(Date.now() / 1000) } = options
  const delta: Record<string, unknown> = {}
  if (role) delta.role = role
  if (content !== undefined) delta.content = content
  if (reasoningContent !== undefined) delta.reasoning_content = reasoningContent
  if (toolCalls !== undefined) delta.tool_calls = toolCalls

  return `data: ${JSON.stringify({
    id,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [
      {
        index: 0,
        delta,
        finish_reason: finishReason ?? null,
      },
    ],
  })}\n\n`
}

export function buildOpenAIDone(): string {
  return 'data: [DONE]\n\n'
}

// ============ Gemini API ============

export function buildGeminiResponse(text: string, model: string, thinking?: string): Record<string, unknown> {
  const parts: Array<Record<string, unknown>> = []

  if (thinking) {
    parts.push({ text: thinking, thought: true })
  }
  parts.push({ text })

  return {
    candidates: [
      {
        content: {
          parts,
          role: 'model',
        },
        finishReason: 'STOP',
      },
    ],
    modelVersion: model,
  }
}

export function buildGeminiStreamChunk(text: string, isThought = false): string {
  const part: Record<string, unknown> = { text }
  if (isThought) {
    part.thought = true
  }
  return JSON.stringify({
    candidates: [
      {
        content: {
          parts: [part],
          role: 'model',
        },
      },
    ],
  }) + '\n'
}

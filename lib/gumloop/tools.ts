import type { ClaudeTool } from './types'

// ============ Tool Definition Conversion ============

export function toolsToSystemPrompt(tools: ClaudeTool[]): string {
  if (!tools.length) return ''

  const lines = ['You have access to the following tools:\n']

  for (const tool of tools) {
    lines.push(`<tool name="${tool.name}">`)
    if (tool.description) {
      lines.push(`<description>${tool.description}</description>`)
    }
    if (tool.input_schema) {
      lines.push(`<parameters>${JSON.stringify(tool.input_schema)}</parameters>`)
    }
    lines.push('</tool>\n')
  }

  lines.push(`
When you need to use a tool, output it in this exact format:
<tool_use>
<name>tool_name</name>
<input>{"param": "value"}</input>
</tool_use>

You can use multiple tools in one response. After outputting tool_use blocks, wait for the tool results before continuing.
`)

  return lines.join('\n')
}

// ============ Tool Call Parsing ============

const TOOL_USE_PATTERN = /<tool_use(?:\s+id="([^"]*)")?>\s*<name>([^<]+)<\/name>\s*<input>(.*?)<\/input>\s*<\/tool_use>/gs

export interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

function generateToolId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = 'toolu_'
  for (let i = 0; i < 24; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}

export function parseToolCalls(text: string): { remainingText: string; toolUses: ToolUseBlock[] } {
  const toolUses: ToolUseBlock[] = []

  for (const match of text.matchAll(TOOL_USE_PATTERN)) {
    const toolId = match[1] || generateToolId()
    const name = match[2].trim()
    const inputStr = match[3].trim()

    let input: Record<string, unknown>
    try {
      input = JSON.parse(inputStr)
    } catch {
      input = { raw: inputStr }
    }

    toolUses.push({ type: 'tool_use', id: toolId, name, input })
  }

  const remainingText = text.replace(TOOL_USE_PATTERN, '').trim()
  return { remainingText, toolUses }
}

// ============ Tool Result Conversion ============

export interface ToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content: string | Array<{ type: string; text?: string }>
  is_error?: boolean
}

export function toolResultToText(result: ToolResultBlock): string {
  let content = result.content
  if (Array.isArray(content)) {
    content = content
      .filter((item) => typeof item === 'object' && item.type === 'text')
      .map((item) => item.text || '')
      .join('\n')
  }
  const status = result.is_error ? 'error' : 'success'
  return `<tool_result tool_use_id="${result.tool_use_id}" status="${status}">\n${content}\n</tool_result>`
}

export function toolUseToText(toolUse: ToolUseBlock): string {
  const inputJson = JSON.stringify(toolUse.input)
  return `<tool_use id="${toolUse.id}">\n<name>${toolUse.name}</name>\n<input>${inputJson}</input>\n</tool_use>`
}

// ============ Message Conversion ============

interface MessageContent {
  type: string
  text?: string
  tool_use_id?: string
  content?: string | Array<{ type: string; text?: string }>
  is_error?: boolean
  id?: string
  name?: string
  input?: Record<string, unknown>
}

interface Message {
  role: string
  content: string | MessageContent[] | Record<string, unknown>[]
}

export function convertMessageContent(content: string | MessageContent[] | Record<string, unknown>[]): {
  textContent: string
  toolBlocks: Array<ToolUseBlock | ToolResultBlock>
} {
  if (typeof content === 'string') {
    return { textContent: content, toolBlocks: [] }
  }

  const textParts: string[] = []
  const toolBlocks: Array<ToolUseBlock | ToolResultBlock> = []

  for (const block of content) {
    const b = block as MessageContent
    if (b.type === 'text' && b.text) {
      textParts.push(b.text)
    } else if (b.type === 'tool_use') {
      toolBlocks.push({
        type: 'tool_use',
        id: b.id || generateToolId(),
        name: b.name || '',
        input: b.input || {},
      })
    } else if (b.type === 'tool_result') {
      toolBlocks.push({
        type: 'tool_result',
        tool_use_id: b.tool_use_id || '',
        content: b.content || '',
        is_error: b.is_error,
      })
    }
  }

  return { textContent: textParts.join('\n'), toolBlocks }
}

function mergeConsecutiveMessages(messages: Array<{ role: string; content: string }>): Array<{ role: string; content: string }> {
  if (!messages.length) return []

  const result: Array<{ role: string; content: string }> = []
  let pendingRole: string | null = null
  let pendingContents: string[] = []

  for (const msg of messages) {
    if (msg.role === pendingRole) {
      if (msg.content) pendingContents.push(msg.content)
    } else {
      if (pendingRole && pendingContents.length) {
        result.push({ role: pendingRole, content: pendingContents.join('\n\n') })
      }
      pendingRole = msg.role
      pendingContents = msg.content ? [msg.content] : []
    }
  }

  if (pendingRole && pendingContents.length) {
    result.push({ role: pendingRole, content: pendingContents.join('\n\n') })
  }

  return result
}

export function convertMessagesSimple(messages: Message[]): Array<{ role: string; content: string }> {
  const result: Array<{ role: string; content: string }> = []
  const seenToolResultIds = new Set<string>()

  for (const msg of messages) {
    const { textContent, toolBlocks } = convertMessageContent(msg.content)

    if (msg.role === 'assistant') {
      const parts: string[] = []
      if (textContent) parts.push(textContent)
      for (const block of toolBlocks) {
        if (block.type === 'tool_use') {
          parts.push(toolUseToText(block))
        }
      }
      if (parts.length) {
        result.push({ role: 'assistant', content: parts.join('\n') })
      }
    } else {
      const parts: string[] = []
      if (textContent) parts.push(textContent)
      for (const block of toolBlocks) {
        if (block.type === 'tool_result') {
          const toolUseId = block.tool_use_id
          if (toolUseId && seenToolResultIds.has(toolUseId)) continue
          if (toolUseId) seenToolResultIds.add(toolUseId)
          parts.push(toolResultToText(block))
        }
      }
      if (parts.length) {
        result.push({ role: 'user', content: parts.join('\n') })
      }
    }
  }

  return mergeConsecutiveMessages(result)
}

export function convertMessagesWithTools(
  messages: Message[],
  tools?: ClaudeTool[],
  system?: string
): Array<{ role: string; content: string }> {
  const result: Array<{ role: string; content: string }> = []
  const seenToolResultIds = new Set<string>()

  const systemParts: string[] = []
  if (system) systemParts.push(system)
  if (tools?.length) systemParts.push(toolsToSystemPrompt(tools))

  if (systemParts.length) {
    result.push({ role: 'user', content: `[System]: ${systemParts.join('\n')}` })
  }

  for (const msg of messages) {
    const { textContent, toolBlocks } = convertMessageContent(msg.content)

    if (msg.role === 'assistant') {
      const parts: string[] = []
      if (textContent) parts.push(textContent)
      for (const block of toolBlocks) {
        if (block.type === 'tool_use') {
          parts.push(toolUseToText(block))
        }
      }
      if (parts.length) {
        result.push({ role: 'assistant', content: parts.join('\n') })
      }
    } else {
      const parts: string[] = []
      if (textContent) parts.push(textContent)
      for (const block of toolBlocks) {
        if (block.type === 'tool_result') {
          const toolUseId = block.tool_use_id
          if (toolUseId && seenToolResultIds.has(toolUseId)) continue
          if (toolUseId) seenToolResultIds.add(toolUseId)
          parts.push(toolResultToText(block))
        }
      }
      if (parts.length) {
        result.push({ role: 'user', content: parts.join('\n') })
      }
    }
  }

  return mergeConsecutiveMessages(result)
}

// ============ Loop Detection ============

export function detectToolLoop(messages: Message[], threshold = 3): string | null {
  const recentCalls: Array<[string, string]> = []
  const seenToolResultIds = new Set<string>()
  const duplicateResults: string[] = []

  const recentMessages = messages.slice(-15)

  for (const msg of recentMessages) {
    const { toolBlocks } = convertMessageContent(msg.content)

    if (msg.role === 'assistant') {
      for (const block of toolBlocks) {
        if (block.type === 'tool_use') {
          const callSig: [string, string] = [block.name, JSON.stringify(block.input)]
          recentCalls.push(callSig)
        }
      }
    } else {
      for (const block of toolBlocks) {
        if (block.type === 'tool_result') {
          const toolUseId = block.tool_use_id
          if (toolUseId) {
            if (seenToolResultIds.has(toolUseId)) {
              duplicateResults.push(toolUseId)
            }
            seenToolResultIds.add(toolUseId)
          }
        }
      }
    }
  }

  if (recentCalls.length >= threshold) {
    const lastCall = recentCalls[recentCalls.length - 1]
    const lastCalls = recentCalls.slice(-threshold)
    const consecutive = lastCalls.filter(
      (c) => c[0] === lastCall[0] && c[1] === lastCall[1]
    ).length
    if (consecutive >= threshold) {
      return `Detected infinite loop: tool '${lastCall[0]}' called ${consecutive} times consecutively with same input`
    }
  }

  if (duplicateResults.length >= 2) {
    return `Detected duplicate tool_results: ${duplicateResults.slice(0, 3).join(', ')}. This may cause infinite loops.`
  }

  return null
}

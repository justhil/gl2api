import type { OpenAITool, ClaudeTool, OpenAIMessage } from './types'
import { toolsToSystemPrompt } from './tools'

// OpenAI 工具格式 -> Claude 工具格式转换
export function convertOpenAIToolsToClaudeTools(openAITools?: OpenAITool[]): ClaudeTool[] {
  if (!openAITools?.length) return []

  return openAITools.map((tool) => {
    const { function: func } = tool
    return {
      name: func.name,
      description: func.description || '',
      input_schema: func.parameters || { type: 'object', properties: {} },
    }
  })
}

// OpenAI 工具消息转换为 Claude 格式工具消息
export function convertToolMessages(messages: OpenAIMessage[]): OpenAIMessage[] {
  const converted: OpenAIMessage[] = []
  const toolResultById: Record<string, { role: string; content: string }> = {}

  // 提取所有 'tool' 角色的消息，按 tool_call_id 索引
  for (const msg of messages) {
    if (msg.role === 'tool' && msg.tool_call_id && msg.content) {
      toolResultById[msg.tool_call_id] = {
        role: 'user',
        content: `<tool_result tool_use_id="${msg.tool_call_id}" status="success">\n${msg.content}\n</tool_result>`,
      }
    } else {
      converted.push(msg)
    }
  }

  // 将工具结果添加到对应的用户消息之后
  for (let i = 0; i < converted.length; i++) {
    const msg = converted[i]
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (
          typeof part === 'object' &&
          part?.type === 'tool_call' &&
          part.id &&
          toolResultById[part.id]
        ) {
          // 将工具结果插入到助手消息之后
          converted.splice(i + 1, 0, toolResultById[part.id] as OpenAIMessage)
          i++ // 跳过新插入的消息
          delete toolResultById[part.id]
        }
      }
    }
  }

  // 添加任何未匹配的工具结果到末尾
  for (const id in toolResultById) {
    converted.push(toolResultById[id] as OpenAIMessage)
  }

  return converted
}

// 检测消息列表中是否包含工具消息
export function hasToolMessages(messages: OpenAIMessage[]): boolean {
  return messages.some(msg => msg.role === 'tool' || Array.isArray(msg.content) && msg.content.some(part =>
    typeof part === 'object' && part?.type === 'tool_call'
  ))
}

// 将 OpenAI 格式的消息和工具转换为包含内嵌工具提示的格式
export function convertMessagesWithOpenAITools(
  messages: OpenAIMessage[],
  openAITools?: OpenAITool[]
): {
  convertedMessages: OpenAIMessage[],
  hasTools: boolean
} {
  // 转换工具定义
  const claudeTools = convertOpenAIToolsToClaudeTools(openAITools)
  const hasTools = Boolean(claudeTools.length) || hasToolMessages(messages)

  if (!hasTools) {
    return { convertedMessages: messages, hasTools: false }
  }

  // 转换工具消息
  const toolMessagesConverted = convertToolMessages(messages)

  // 创建内嵌工具提示
  const toolsPrompt = toolsToSystemPrompt(claudeTools)

  // 如果列表中第一条消息是用户消息，将工具提示合并到其中
  // 否则，创建一个新的用户消息包含工具提示
  const result = [...toolMessagesConverted]
  const firstUserMsgIndex = result.findIndex(m => m.role === 'user')

  if (firstUserMsgIndex >= 0) {
    const firstUserMsg = result[firstUserMsgIndex]
    result[firstUserMsgIndex] = {
      ...firstUserMsg,
      content: `[System]: ${toolsPrompt}\n\n${firstUserMsg.content}`,
    }
  } else {
    result.unshift({ role: 'user', content: `[System]: ${toolsPrompt}` })
  }

  return { convertedMessages: result, hasTools }
}

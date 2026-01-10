import type { GumloopEvent } from './types'

export interface HandlerResult {
  type: string
  index?: number
  delta?: string
  finishReason?: string
  usage?: {
    input_tokens: number
    output_tokens: number
    total_tokens: number
  }
}

export class GumloopStreamHandler {
  model: string
  inputTokens: number
  outputTokens: number
  textBuffer: string[] = []
  reasoningBuffer: string[] = []
  blockIndex = -1
  inText = false
  inReasoning = false
  finished = false

  constructor(model = 'claude-sonnet-4-5', inputTokens = 0) {
    this.model = model
    this.inputTokens = inputTokens
    this.outputTokens = 0
  }

  handleEvent(event: GumloopEvent): HandlerResult {
    if (this.finished) {
      return { type: 'ignored' }
    }

    switch (event.type) {
      case 'step-start':
        return { type: 'step_start' }

      case 'reasoning-start':
        this.inReasoning = true
        this.blockIndex++
        return { type: 'reasoning_start', index: this.blockIndex }

      case 'reasoning-delta':
        if (event.delta) {
          this.reasoningBuffer.push(event.delta)
        }
        return { type: 'reasoning_delta', delta: event.delta, index: this.blockIndex }

      case 'reasoning-end':
        this.inReasoning = false
        return { type: 'reasoning_end', index: this.blockIndex }

      case 'text-start':
        this.inText = true
        this.blockIndex++
        return { type: 'text_start', index: this.blockIndex }

      case 'text-delta':
        // Claude模型在reasoning后可能不发送text-start，直接发送text-delta
        // 返回 text_start 让调用方知道需要开始新的文本块
        if (!this.inText) {
          this.inText = true
          this.blockIndex++
          if (event.delta) {
            this.textBuffer.push(event.delta)
          }
          return { type: 'text_start', index: this.blockIndex, delta: event.delta }
        }
        if (event.delta) {
          this.textBuffer.push(event.delta)
        }
        return { type: 'text_delta', delta: event.delta, index: this.blockIndex }

      case 'text-end':
        this.inText = false
        return { type: 'text_end', index: this.blockIndex }

      case 'finish':
        // 只处理 final: true 的 finish 事件
        if (this.finished || !event.final) return { type: 'ignored' }
        this.finished = true
        const usage = event.usage || {}
        this.outputTokens = usage.output_tokens || Math.ceil(this.getFullText().length / 4)
        this.inputTokens = usage.input_tokens || this.inputTokens
        return {
          type: 'finish',
          finishReason: event.finishReason || 'end_turn',
          usage: {
            input_tokens: this.inputTokens,
            output_tokens: this.outputTokens,
            total_tokens: this.inputTokens + this.outputTokens,
          },
        }

      default:
        return { type: 'unknown' }
    }
  }

  getFullText(): string {
    return this.textBuffer.join('')
  }

  getFullReasoning(): string {
    return this.reasoningBuffer.join('')
  }
}

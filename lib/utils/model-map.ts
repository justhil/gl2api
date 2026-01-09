export function mapModel(model: string): string {
  const m = model.toLowerCase()
  if (m.includes('opus') || m.includes('gpt-4-turbo')) {
    return 'claude-opus-4-5'
  }
  if (m.includes('haiku') || m.includes('gpt-3.5')) {
    return 'claude-haiku-4-5'
  }
  return 'claude-sonnet-4-5'
}

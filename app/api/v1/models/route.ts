import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    data: [
      { id: 'claude-sonnet-4-5', object: 'model' },
      { id: 'claude-opus-4-5', object: 'model' },
      { id: 'claude-haiku-4-5', object: 'model' },
      { id: 'gpt-4', object: 'model' },
      { id: 'gpt-4-turbo', object: 'model' },
      { id: 'gpt-3.5-turbo', object: 'model' },
    ],
  })
}

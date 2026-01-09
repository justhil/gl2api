import { NextResponse } from 'next/server'
import { AVAILABLE_MODELS } from '@/lib/utils/model-map'

export async function GET() {
  const models = AVAILABLE_MODELS.map((id) => ({
    id,
    object: 'model',
    created: 1700000000,
    owned_by: 'gumloop',
  }))

  return NextResponse.json({
    object: 'list',
    data: models,
  })
}

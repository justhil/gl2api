import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/utils/admin'
import { getAllStats } from '@/lib/db/stats'

export async function GET(req: NextRequest) {
  if (!verifyAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const stats = await getAllStats()
  return NextResponse.json(stats)
}

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'

const LoginSchema = z.object({
  password: z.string(),
})

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = LoginSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: 'Invalid request' }, { status: 400 })
  }

  if (parsed.data.password === ADMIN_PASSWORD) {
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ success: false, message: 'Invalid password' })
}

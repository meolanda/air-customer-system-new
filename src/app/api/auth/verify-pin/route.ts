import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkRateLimit, rateLimitResponse } from '@/lib/api-middleware'

const PinSchema = z.object({
  pin: z.string().min(4).max(20),
})

// Rate limit แบบเข้มข้นกว่าปกติสำหรับ auth endpoint
const authAttempts = new Map<string, { count: number; resetAt: number }>()

function checkAuthRateLimit(request: NextRequest): boolean {
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded ? (forwarded.split(',')[0]?.trim() ?? 'unknown') : 'unknown'
  const now = Date.now()
  const entry = authAttempts.get(ip)

  if (!entry || now > entry.resetAt) {
    authAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 }) // 15 นาที
    return true
  }

  if (entry.count >= 10) return false // max 10 ครั้งต่อ 15 นาที
  entry.count++
  return true
}

export async function POST(request: NextRequest) {
  if (!checkRateLimit(request)) return rateLimitResponse()
  if (!checkAuthRateLimit(request)) {
    return NextResponse.json(
      { error: 'Too many PIN attempts. Try again in 15 minutes.' },
      { status: 429 }
    )
  }

  try {
    const body = await request.json()
    const validated = PinSchema.safeParse(body)
    if (!validated.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const correctPin = process.env['STORE_PIN'] || '123456'
    const isValid = validated.data.pin === correctPin

    if (!isValid) {
      return NextResponse.json({ error: 'PIN ไม่ถูกต้อง' }, { status: 401 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

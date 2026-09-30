import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkRateLimit, rateLimitResponse } from '@/lib/api-middleware'
import { SESSION_COOKIE, SESSION_MAX_AGE, createSessionToken, pinMatches } from '@/lib/session'

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

    const correctPin = process.env['STORE_PIN']
    if (!correctPin) {
      console.error('STORE_PIN is not set')
      return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
    }

    if (!pinMatches(validated.data.pin, correctPin)) {
      return NextResponse.json({ error: 'PIN ไม่ถูกต้อง' }, { status: 401 })
    }

    const token = await createSessionToken()
    if (!token) return NextResponse.json({ error: 'Server error' }, { status: 500 })

    const res = NextResponse.json({ success: true })
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE,
    })
    return res
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

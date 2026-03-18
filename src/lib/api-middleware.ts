import { NextRequest, NextResponse } from 'next/server'

// Simple in-process rate limiter (per Vercel function instance)
// สำหรับ production จริงๆ ควรใช้ Upstash Redis
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 60 // requests
const RATE_WINDOW = 60 * 1000 // 1 minute

function getRateLimitKey(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0]?.trim() ?? 'unknown' : 'unknown'
  const path = new URL(request.url).pathname
  return `${ip}:${path}`
}

export function checkRateLimit(request: NextRequest): boolean {
  const key = getRateLimitKey(request)
  const now = Date.now()
  const entry = rateLimitMap.get(key)

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_WINDOW })
    return true
  }

  if (entry.count >= RATE_LIMIT) return false

  entry.count++
  return true
}

export function rateLimitResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests. Please try again later.' },
    { status: 429, headers: { 'Retry-After': '60' } }
  )
}

// ตรวจสอบ API Secret (สำหรับ server-to-server calls)
// Frontend calls ไม่ต้องใช้ เพราะ auth ด้วย session/user แทน
export function checkApiSecret(request: NextRequest): boolean {
  const secret = process.env['API_SECRET_KEY']
  if (!secret) return true // ถ้าไม่ได้ตั้ง env = ไม่บังคับ

  const provided = request.headers.get('x-api-secret')
  return provided === secret
}

export function unauthorizedResponse(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

// Wrapper สำหรับ internal API routes (sheets, calendar, telegram)
// ใช้ตรวจ rate limit เป็นหลัก
export function withRateLimit(
  handler: (req: NextRequest) => Promise<NextResponse>
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    if (!checkRateLimit(request)) {
      return rateLimitResponse()
    }
    return handler(request)
  }
}

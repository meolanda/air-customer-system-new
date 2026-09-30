import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session'

// API ที่เปิดให้เรียกได้โดยไม่ต้องล็อกอิน (ใช้ล็อกอินและเช็คสถานะ)
const PUBLIC_API = ['/api/auth/verify-pin', '/api/auth/session']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (PUBLIC_API.includes(pathname)) return NextResponse.next()

  const token = request.cookies.get(SESSION_COOKIE)?.value
  if (await verifySessionToken(token)) return NextResponse.next()

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export const config = {
  matcher: '/api/:path*',
}

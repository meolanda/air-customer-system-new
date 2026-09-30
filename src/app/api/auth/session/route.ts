import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session'

// เช็คว่ายังล็อกอินอยู่ไหม
export async function GET(request: NextRequest) {
  const ok = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)
  return NextResponse.json({ authenticated: ok })
}

// ออกจากระบบ
export async function DELETE() {
  const res = NextResponse.json({ success: true })
  res.cookies.delete(SESSION_COOKIE)
  return res
}

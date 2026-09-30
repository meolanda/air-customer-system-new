import { NextResponse } from 'next/server'
import { createFirebaseCustomToken } from '@/lib/firebase-server'

// ต้องผ่าน proxy (มี session จาก PIN) ถึงจะมาถึงตรงนี้ได้
export async function GET() {
  const token = createFirebaseCustomToken('store-staff')
  if (!token) return NextResponse.json({ error: 'Firebase not configured' }, { status: 500 })
  return NextResponse.json({ token })
}

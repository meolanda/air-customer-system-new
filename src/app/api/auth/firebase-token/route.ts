import { NextResponse } from 'next/server'
import { createFirebaseCustomToken } from '@/lib/firebase-server'

// ต้องผ่าน proxy (มี session จาก PIN) ถึงจะมาถึงตรงนี้ได้
export async function GET() {
  try {
    const token = createFirebaseCustomToken('store-staff')
    if (!token) return NextResponse.json({ error: 'Firebase not configured' }, { status: 500 })
    return NextResponse.json({ token })
  } catch (e) {
    console.error('firebase-token: cannot sign token (check FIREBASE_PRIVATE_KEY format):', (e as Error).message)
    return NextResponse.json({ error: 'Firebase key invalid' }, { status: 500 })
  }
}

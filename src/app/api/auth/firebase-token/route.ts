import { NextResponse } from 'next/server'
import { createFirebaseCustomToken } from '@/lib/firebase-server'

// ต้องผ่าน proxy (มี session จาก PIN) ถึงจะมาถึงตรงนี้ได้
export async function GET() {
  try {
    const token = createFirebaseCustomToken('store-staff')
    if (token) return NextResponse.json({ token })

    // ไม่เปิดเผยค่าจริง บอกแค่รูปแบบ เพื่อช่วยหาว่าตั้งค่าตัวแปรผิดตรงไหน
    const email = process.env['FIREBASE_CLIENT_EMAIL'] ?? ''
    const key = process.env['FIREBASE_PRIVATE_KEY'] ?? ''
    return NextResponse.json(
      {
        error: 'Firebase not configured',
        diagnostics: {
          emailSet: email.trim().length > 0,
          emailEndsWithServiceAccountDomain: email.trim().endsWith('.iam.gserviceaccount.com'),
          keySet: key.trim().length > 0,
          keyLength: key.length,
          keyHasBegin: key.includes('-----BEGIN'),
          keyHasEnd: key.includes('-----END'),
        },
      },
      { status: 500 }
    )
  } catch (e) {
    console.error('firebase-token: cannot sign token (check FIREBASE_PRIVATE_KEY format):', (e as Error).message)
    return NextResponse.json({ error: 'Firebase key invalid' }, { status: 500 })
  }
}

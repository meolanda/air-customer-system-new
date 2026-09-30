import { NextResponse } from 'next/server'
import { createFirebaseCustomToken } from '@/lib/firebase-server'
import { normalizePrivateKey } from '@/lib/pem'

// สรุปลักษณะของตัวแปร (ไม่เปิดเผยค่าจริง) เพื่อช่วยหาว่าตั้งค่าผิดตรงไหน
function describeEnv() {
  const json = process.env['FIREBASE_SERVICE_ACCOUNT_JSON'] ?? ''
  const email = process.env['FIREBASE_CLIENT_EMAIL'] ?? ''
  const key = process.env['FIREBASE_PRIVATE_KEY'] ?? ''
  let jsonParses = false
  let jsonHasEmail = false
  let jsonKeyLength = 0
  let jsonKeyNormalizes = false
  try {
    const parsed = JSON.parse(json.trim()) as { client_email?: string; private_key?: string }
    jsonParses = true
    jsonHasEmail = Boolean(parsed.client_email)
    jsonKeyLength = parsed.private_key?.length ?? 0
    jsonKeyNormalizes = normalizePrivateKey(parsed.private_key) !== null
  } catch {
    /* ไม่ใช่ JSON */
  }
  return {
    json: {
      set: json.trim().length > 0,
      length: json.length,
      startsWithBrace: json.trim().startsWith('{'),
      endsWithBrace: json.trim().endsWith('}'),
      parses: jsonParses,
      hasEmail: jsonHasEmail,
      privateKeyLength: jsonKeyLength,
      privateKeyNormalizes: jsonKeyNormalizes,
    },
    separate: {
      emailSet: email.trim().length > 0,
      emailEndsWithServiceAccountDomain: email.trim().endsWith('.iam.gserviceaccount.com'),
      keyLength: key.length,
      keyHasBegin: key.includes('-----BEGIN'),
      keyHasEnd: key.includes('-----END'),
    },
  }
}

// ต้องผ่าน proxy (มี session จาก PIN) ถึงจะมาถึงตรงนี้ได้
export async function GET() {
  try {
    const token = createFirebaseCustomToken('store-staff')
    if (token) return NextResponse.json({ token })
    return NextResponse.json(
      { error: 'Firebase not configured', diagnostics: describeEnv() },
      { status: 500 }
    )
  } catch (e) {
    console.error('firebase-token: cannot sign token:', (e as Error).message)
    return NextResponse.json(
      { error: 'Firebase key invalid', diagnostics: describeEnv() },
      { status: 500 }
    )
  }
}

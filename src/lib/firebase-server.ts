// ฝั่งเซิร์ฟเวอร์เท่านั้น — ใช้ service account ของโปรเจกต์ Firebase (ข้ามกฎ rules ได้)
import { createSign } from 'crypto'
import { google } from 'googleapis'
import { normalizePrivateKey } from '@/lib/pem'

export const FIREBASE_DB_URL =
  'https://customer-reception-system-default-rtdb.asia-southeast1.firebasedatabase.app'

function getCredentials(): { email: string; key: string } | null {
  const email = process.env['FIREBASE_CLIENT_EMAIL']
  const key = normalizePrivateKey(process.env['FIREBASE_PRIVATE_KEY'])
  return email && key ? { email, key } : null
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString('base64url')

// ออก Firebase custom token (JWT RS256) ให้ทีมที่ผ่าน PIN แล้ว
export function createFirebaseCustomToken(uid: string): string | null {
  const cred = getCredentials()
  if (!cred) return null
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = b64url(
    JSON.stringify({
      iss: cred.email,
      sub: cred.email,
      aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
      iat: now,
      exp: now + 3600,
      uid,
    })
  )
  const signature = createSign('RSA-SHA256').update(`${header}.${payload}`).sign(cred.key)
  return `${header}.${payload}.${b64url(signature)}`
}

// เขียนข้อมูลลง Realtime Database ผ่าน REST ด้วยสิทธิ์ service account
export async function firebaseAdminSet(path: string, data: unknown): Promise<void> {
  const cred = getCredentials()
  if (!cred) throw new Error('FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY is not set')
  const jwt = new google.auth.JWT({
    email: cred.email,
    key: cred.key,
    scopes: [
      'https://www.googleapis.com/auth/firebase.database',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
  })
  const { token } = await jwt.getAccessToken()
  const res = await fetch(`${FIREBASE_DB_URL}/${path}.json`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`Firebase write failed: ${res.status}`)
}

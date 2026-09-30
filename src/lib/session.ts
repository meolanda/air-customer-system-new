// Signed session token (HMAC-SHA256) — ใช้ Web Crypto เพื่อให้ทำงานได้ทั้ง proxy และ route handler
export const SESSION_COOKIE = 'aircon_session'
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60 // 30 วัน (วินาที)

const encoder = new TextEncoder()

function getSecret(): string | null {
  return process.env['SESSION_SECRET'] || process.env['STORE_PIN'] || null
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)))
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function createSessionToken(): Promise<string | null> {
  const secret = getSecret()
  if (!secret) return null
  const expires = String(Date.now() + SESSION_MAX_AGE * 1000)
  return `${expires}.${await sign(expires, secret)}`
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  const secret = getSecret()
  if (!secret || !token) return false
  const [expires, signature] = token.split('.')
  if (!expires || !signature || Number(expires) < Date.now()) return false
  return safeEqual(signature, await sign(expires, secret))
}

// เทียบ PIN แบบไม่รั่วเวลา
export function pinMatches(input: string, correct: string): boolean {
  return safeEqual(input, correct)
}

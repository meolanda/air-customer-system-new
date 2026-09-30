// แปลงค่า private key จาก env ให้เป็น PEM ที่ถูกต้อง
// รองรับที่ที่มักเพี้ยนตอนวางใน Vercel: มี "" ครอบ, ใช้ \n แบบตัวอักษร, บรรทัดใหม่กลายเป็นช่องว่าง
export function normalizePrivateKey(raw: string | undefined): string | null {
  if (!raw) return null
  let value = raw.trim()
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }
  value = value.replace(/\r/g, '').replace(/\n/g, '\n').replace(/\r/g, '')

  const match = value.match(/-----BEGIN ([A-Z ]+)-----([\s\S]*?)-----END \1-----/)
  if (!match) return null
  const label = match[1]
  const body = (match[2] ?? '').replace(/[^A-Za-z0-9+/=]/g, '')
  if (!body) return null
  const lines = body.match(/.{1,64}/g) ?? []
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`
}

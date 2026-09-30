import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

// ไอคอนแอป (เกล็ดหิมะบนพื้นน้ำเงิน) — สร้างตอนเรียก ไม่ต้องมีไฟล์ PNG
export async function GET(request: NextRequest) {
  const requested = Number(request.nextUrl.searchParams.get('size'))
  const size = [180, 192, 512].includes(requested) ? requested : 512
  const arm = (deg: number) => (
    <div
      key={deg}
      style={{
        position: 'absolute',
        left: size / 2 - size * 0.03,
        top: size * 0.2,
        width: size * 0.06,
        height: size * 0.6,
        borderRadius: size,
        background: 'white',
        transform: `rotate(${deg}deg)`,
      }}
    />
  )

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: 'flex',
          position: 'relative',
          background: '#3b82f6',
        }}
      >
        {[0, 60, 120].map(arm)}
      </div>
    ),
    { width: size, height: size }
  )
}

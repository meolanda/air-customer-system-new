import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, rateLimitResponse } from '@/lib/api-middleware'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  if (!checkRateLimit(req)) return rateLimitResponse()
  try {
    const { pdfBase64 } = await req.json()

    if (!pdfBase64) {
      return NextResponse.json({ error: 'PDF data is required' }, { status: 400 })
    }

    const apiKey = process.env['GEMINI_API_KEY']
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY is not configured' }, { status: 500 })
    }

    // Strip data URI prefix if present
    const base64Data = pdfBase64.replace(/^data:application\/pdf;base64,/, '')

    // Check size (Gemini inline limit ~20MB decoded)
    const sizeBytes = Math.ceil(base64Data.length * 0.75)
    if (sizeBytes > 20 * 1024 * 1024) {
      return NextResponse.json({ error: 'ไฟล์ PDF ใหญ่เกิน 20MB กรุณาใช้ไฟล์ที่เล็กกว่า' }, { status: 400 })
    }

    const prompt = `วิเคราะห์เอกสาร PDF นี้ (ใบเสนอราคา บิล หรือเอกสารงานแอร์)\n\nดึงข้อมูลต่อไปนี้แล้วตอบเป็น JSON ล้วนๆ:\n\n1. shopName: ชื่อร้าน แบรนด์ บริษัท หรือองค์กร (ถ้าไม่มีให้เว้นว่าง "")\n2. contactName: ชื่อบุคคลผู้ติดต่อ เช่น คุณ/พี่/นาย/นาง (ถ้าไม่มีให้เว้นว่าง "")\n3. phone: เบอร์โทรศัพท์ (ถ้ามี)\n4. address: ที่อยู่ ชื่อสาขา หรือสถานที่ (ถ้ามี)\n5. serviceType: เลือก 1 อย่าง: "ล้างแอร์", "ซ่อม", "ติดตั้ง", "ตรวจสอบ", "อื่นๆ"\n6. description: สรุปรายละเอียดงาน รายการสินค้า หรือเนื้อหาสำคัญจาก PDF\n7. extractedText: ข้อความทั้งหมดที่อ่านได้จาก PDF (สรุปแบบกระชับ)\n\nตอบเป็น JSON ล้วนๆ ไม่มี markdown:\n{"shopName":"","contactName":"","phone":"","address":"","serviceType":"","description":"","extractedText":""}`

    const payload = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: 'application/pdf',
                data: base64Data,
              },
            },
          ],
        },
      ],
      generationConfig: { response_mime_type: 'application/json' },
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const jsonData = await response.json()

    if (!response.ok) {
      throw new Error(jsonData.error?.message || 'Failed to fetch from Gemini')
    }

    const resultText = jsonData.candidates[0].content.parts[0].text
    const data = JSON.parse(resultText)

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('AI PDF Analysis Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

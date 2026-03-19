import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from '@/lib/api-middleware'

export async function POST(req: NextRequest) {
  if (!checkRateLimit(req)) return rateLimitResponse()
  try {
    const { text } = await req.json();

    if (!text) {
      return NextResponse.json(
        { error: "Text is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env['GEMINI_API_KEY'];

    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not configured" },
        { status: 500 }
      );
    }

    const prompt = `คุณคือผู้ช่วยระบบรับงานบริการแอร์ของบริษัท วิเคราะห์ข้อความต่อไปนี้แล้วดึงข้อมูลออกมา:\n"${text}"\n\nกฎการดึงข้อมูล (ปฏิบัติตามอย่างเคร่งครัด):\n\n1. customerName: ชื่อร้าน แบรนด์ บริษัท หรือองค์กร เท่านั้น\n   - ตัวอย่างที่ถูก: "KFC", "ที.เอส มอเตอร์", "โรงแรมแกรนด์", "ลค.ที.เอส มอเตอร์" → "ที.เอส มอเตอร์"\n   - ถ้าไม่มีชื่อร้าน/แบรนด์ ให้เว้นว่าง ""\n   - ห้ามใส่ชื่อคน ห้ามใส่คำกริยาหรือรายละเอียดงาน\n\n2. contactName: ชื่อบุคคลที่เป็น "ผู้ติดต่อ" หรือ "เจ้าของงาน" เท่านั้น\n   - มักตามหลังคำว่า "ติดต่อ", "คุณ", "พี่", "น้อง", "นาย", "นาง", "นางสาว"\n   - ตัวอย่าง: "ติดต่อคุณสุกฤตา เหลืองไพบูลย์ผล" → "คุณสุกฤตา เหลืองไพบูลย์ผล"\n   - ตัวอย่าง: "ติดต่อพี่แอม" → "พี่แอม"\n   - ถ้าไม่มีชื่อคน ให้เว้นว่าง ""\n   - ห้ามใส่ชื่อร้านหรือแบรนด์\n\n3. phone: เบอร์โทรศัพท์ (ถ้ามี)\n\n4. address: ที่อยู่ ชื่อสาขา ชื่อโครงการ หรือสถานที่ (ถ้ามี) หากมีแค่ลิงก์ Maps ให้ใส่ลิงก์นั้น\n\n5. serviceType: เลือก 1 อย่าง: "ล้างแอร์", "ซ่อม", "ติดตั้ง", "ตรวจสอบ", "อื่นๆ"\n\n6. priority: "normal", "urgent", หรือ "emergency"\n\n7. description: สรุปรายละเอียดงานทั้งหมดที่ลูกค้าต้องการ\n\nตอบเป็น JSON ล้วนๆ ไม่มี markdown:\n{"customerName":"","contactName":"","phone":"","address":"","serviceType":"","priority":"","description":""}`;

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { response_mime_type: "application/json" },
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const jsonData = await response.json();

    if (!response.ok) {
      throw new Error(jsonData.error?.message || "Failed to fetch from Gemini");
    }

    const resultText = jsonData.candidates[0].content.parts[0].text;
    const data = JSON.parse(resultText);

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("AI Analysis Error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

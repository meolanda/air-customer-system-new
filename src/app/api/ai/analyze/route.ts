import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
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

    const prompt = `วิเคราะห์ข้อความต่อไปนี้จากลูกค้าที่ต้องการใช้บริการแอร์คอนดิชั่น:\n"${text}"\n\nแยกข้อมูลและตอบกลับเป็นรูปแบบ JSON เท่านั้น โดยปฏิบัติตามกฎต่อไปนี้อย่างเคร่งครัด:\n\n1. customerName: "ระบุเฉพาะชื่อบุคคล, แสลงเรียกบุคคล หรือ แบรนด์/บริษัท/องค์กร เท่านั้น" (ตัวอย่าง: KFC, สตาร์บัคส์, พี่สมชาย, น้องเอ)\n   ***ข้อควรระวังขั้นเด็ดขาด: ห้ามนำ "คำกริยา, คำสั่ง หรือรายละเอียดงาน" (เช่น "ราคาติดตั้ง...", "ส่งช่าง...", "แอร์ไม่เย็น") มาใส่ในช่องนี้เด็ดขาด หากข้อความไม่มีชื่อคนหรือแบรนด์ชัดเจน ให้เว้นว่างไว้ ("")***\n2. phone: "เบอร์โทรศัพท์" (ถ้ามี)\n3. address: "ชื่อสาขา, ชื่อโครงการ, หมู่บ้าน, สถานที่, หรือที่อยู่" (ตัวอย่าง: โฮมเวิร์คพัทยา, มาร์เก็ตเพลส เทพรักษ์, พลัมคอนโด) *สำคัญ: ให้สกัดชื่อสถานที่มาใส่ช่องนี้เสมอ อย่าปะปนกับชื่อลูกค้า*\n4. serviceType: เลือก 1 ในหมวดหมู่ต่อไปนี้เท่านั้น: "ล้างแอร์", "ซ่อม", "ติดตั้ง", "ตรวจสอบ" หรือ "อื่นๆ"\n5. priority: เลือกระดับความเร่งด่วน: "normal", "urgent", "emergency"\n6. description: "สรุปรายละเอียดคำสั่งงาน อาการแอร์ หรือสิ่งที่ลูกค้าต้องการทั้งหมด" (ตัวอย่าง: ราคาติดตั้ง CDU แอร์ขนาด 120,000 BTU ได้วันไหนครับ, ส่งช่างเข้าตรวจสอบระบบฮู้ดให้ด้วยครับ)\n\nตอบเป็น JSON ล้วนๆ ห้ามมีเครื่องหมาย markdown หรือ \`\`\` ครอบ และห้ามมีคำอธิบายเพิ่มเติม:\n{"customerName":"","phone":"","address":"","serviceType":"","priority":"","description":""}`;

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

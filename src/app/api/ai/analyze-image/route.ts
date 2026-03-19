import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const { imageBase64 } = await req.json();

        if (!imageBase64) {
            return NextResponse.json(
                { error: "Image data is required" },
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

        // Remove the data:image/jpeg;base64, prefix if present
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

        // Extract mime type if available, default to jpeg
        let mimeType = "image/jpeg";
        const mimeMatch = imageBase64.match(/^data:(image\/\w+);base64,/);
        if (mimeMatch) {
            mimeType = mimeMatch[1];
        }

        const prompt = `วิเคราะห์รูปภาพบิล ใบเสร็จ นามบัตร หรือภาพหน้างานแอร์นี้\n\nแยกข้อมูลและตอบกลับเป็นรูปแบบ JSON เท่านั้น โดยปฏิบัติตามกฎต่อไปนี้อย่างเคร่งครัด:\n\n1. shopName: "ชื่อร้าน แบรนด์ บริษัท หรือองค์กร" (เช่น KFC, สตาร์บัคส์, โรงแรมแกรนด์ฯ ถ้าไม่มีให้เว้นว่าง "")\n2. contactName: "ชื่อบุคคลผู้ติดต่อ" (ชื่อคนที่ระบุในภาพ เช่น นายสมชาย, พี่แอม ถ้าไม่มีให้เว้นว่าง "")\n3. phone: "เบอร์โทรศัพท์" (ถ้ามี)\n4. address: "ที่อยู่ ชื่อสาขา หรือชื่อโครงการ" (ถ้ามี)\n5. serviceType: เลือก 1 ในหมวดหมู่ต่อไปนี้ถ้าพอเดาได้จากรูป: "ล้างแอร์", "ซ่อม", "ติดตั้ง", "ตรวจสอบ" หรือ "อื่นๆ"\n6. description: "อธิบายสิ่งที่คุณเห็นในภาพ เช่น ยี่ห้อแอร์ อาการเสีย หรือรายละเอียดบิล"\n\nตอบเป็น JSON ล้วนๆ ห้ามมีเครื่องหมาย markdown หรือ \`\`\` ครอบ และห้ามมีคำอธิบายเพิ่มเติม:\n{"shopName":"","contactName":"","phone":"","address":"","serviceType":"","description":""}`;

        const payload = {
            contents: [
                {
                    parts: [
                        { text: prompt },
                        {
                            inline_data: {
                                mime_type: mimeType,
                                data: base64Data
                            }
                        }
                    ]
                }
            ],
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
        console.error("AI Image Analysis Error:", error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}

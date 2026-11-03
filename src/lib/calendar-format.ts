// จัดรูปแบบนัดหมายในปฏิทินสำหรับช่าง (ตามสกิล technician-calendar-standard)
// - ชื่อ: [ลูกค้า] สถานที่ | งานหลัก
// - ห้ามมียอดเงิน/ราคา/เงื่อนไขชำระเงิน เก็บได้เฉพาะเลข QT

const MONEY_LINE = /(฿|บาท|ราคา|ยอด|ต้นทุน|กำไร|เก็บเงิน|วางบิล|ชำระ|มัดจำ|ส่วนลด|ภาษี|vat|\d{1,3}(,\d{3})+(\.\d+)?)/i
const QT_REF = /QT[-\w/]*\d[-\w/]*/i
const MAX_PLACE_LENGTH = 40

function shortPlace(address?: string): string {
    const firstLine = (address ?? '').split('\n')[0]?.trim() ?? ''
    if (!firstLine || /^https?:\/\//i.test(firstLine)) return ''
    return firstLine.length > MAX_PLACE_LENGTH ? `${firstLine.slice(0, MAX_PLACE_LENGTH)}…` : firstLine
}

export function buildEventSummary(customerName: string, address: string | undefined, serviceType: string): string {
    const place = shortPlace(address)
    return `[${customerName}]${place ? ` ${place}` : ''} | ${serviceType}`
}

// ตัดบรรทัดที่มีเรื่องเงินออก ถ้าบรรทัดนั้นมีเลข QT ให้คงไว้เฉพาะเลข QT
export function stripMoneyDetails(text: string): string {
    const kept: string[] = []
    for (const line of text.split('\n')) {
        if (!MONEY_LINE.test(line)) {
            kept.push(line)
            continue
        }
        const qt = line.match(QT_REF)
        if (qt) kept.push(`อ้างอิง: ${qt[0]}`)
    }
    return kept.join('\n').trim()
}

export function buildEventDescription(input: {
    requestNo: string
    customerName: string
    phone: string
    address?: string
    description?: string
}): string {
    const { requestNo, customerName, phone, address, description } = input
    const details = description ? stripMoneyDetails(description) : ''

    let text = `เลขที่งาน: ${requestNo}\nลูกค้า: ${customerName}\nเบอร์โทร: ${phone}`
    if (address) text += `\nสถานที่: ${address}`
    if (details) text += `\nงานที่ต้องทำ: ${details}`
    return text
}

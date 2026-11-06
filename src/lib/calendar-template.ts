// เทมเพลตกลางของนัดหมายในปฏิทินที่ช่างอ่าน (ตามสกิล technician-calendar-standard)
// ที่เดียวกำหนด: ชื่อนัด, ลำดับหัวข้อ, กฎตัดเรื่องเงิน, คำที่ใช้นำหน้าข้อเน้นย้ำ
// หลักการ: มีข้อมูลหัวข้อไหนก็ใส่หัวข้อนั้น ไม่มีก็ข้าม ไม่เดา ไม่ใส่ยอดเงิน เก็บได้แค่เลข QT

// ---------- ค่าคงที่ร่วม (Apps Script ใน Code.gs ใช้ชุดเดียวกัน มีสคริปต์เทียบให้ตรงกัน) ----------

// ตัวเลขแบบ 12,500 ถือเป็นเงิน ยกเว้นตามด้วย BTU (เช่น 60,000 BTU เป็นขนาดแอร์ ไม่ใช่ราคา)
export const MONEY_LINE_SOURCE = '(฿|บาท|ราคา|ยอด|ต้นทุน|กำไร|เก็บเงิน|วางบิล|ชำระ|มัดจำ|ส่วนลด|ภาษี|vat|\\d{1,3}(,\\d{3})+(\\.\\d+)?(?!\\s*(btu|บีทียู)))'
export const EMPHASIS_MARKERS = ['สำคัญ', 'เน้นย้ำ'] as const

const MONEY_LINE = new RegExp(MONEY_LINE_SOURCE, 'i')
const QT_REF = /QT[-\w/]*\d[-\w/]*/gi
const URL_RE = /https?:\/\/[^\s"'<>]+/i
const MAX_PLACE_LENGTH = 24

// ---------- ชื่อนัด ----------

function shortPlace(address?: string): string {
    const withoutUrl = (address ?? '').replace(URL_RE, '')
    const firstLine = withoutUrl.split('\n')[0]?.trim() ?? ''
    if (!firstLine) return ''
    if (firstLine.length <= MAX_PLACE_LENGTH) return firstLine
    // ตัดที่ช่องว่าง/จุลภาคตัวสุดท้ายก่อนเกินความยาว ไม่ให้คำขาดกลางคัน (ถ้าไม่มีให้ตัดตรงๆ)
    const head = firstLine.slice(0, MAX_PLACE_LENGTH)
    const cut = Math.max(head.lastIndexOf(' '), head.lastIndexOf(','))
    return `${(cut > 8 ? head.slice(0, cut) : head).replace(/[\s,]+$/, '')}…`
}

// [ลูกค้า/แบรนด์] สาขา/สถานที่ | งานหลัก
export function buildEventSummary(customerName: string, address: string | undefined, serviceType: string): string {
    // ชื่อที่มี [ ] ครอบอยู่แล้ว (เช่น "[KFC] สาขา...") อย่าซ้อนวงเล็บอีกชั้น
    const name = customerName.trim().replace(/^\[([^\]]*)\]$/, '$1').replace(/[\[\]]/g, '').trim()
    const place = shortPlace(address)
    return `[${name}]${place ? ` ${place}` : ''} | ${serviceType}`
}

// ---------- ตัดเรื่องเงิน ----------

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

// ---------- เนื้อหานัด ----------

export interface CalendarTemplateInput {
    requestNo: string
    customerName: string
    phone: string
    contactName?: string
    address?: string       // ที่อยู่ อาจมีลิงก์แผนที่ปนอยู่
    description?: string   // งานที่ต้องทำ
    notes?: string         // หมายเหตุ / ข้อเน้นย้ำ
    // หัวข้อต่อไปนี้ฟอร์มยังไม่มีช่อง ใส่เมื่อมีข้อมูลจริงเท่านั้น
    machines?: string      // เครื่องเป้าหมาย: ชนิด จำนวน ตำแหน่ง
    parts?: string         // อะไหล่และอุปกรณ์ที่ต้องเตรียม
    handover?: string      // ข้อกำหนดส่งมอบงาน
    acInfo?: string        // ข้อมูลแอร์/อุปกรณ์ในร้าน
}

// ตัดบรรทัดเรื่องเงินทิ้งทั้งบรรทัด และบรรทัดที่เป็นเลข QT ล้วนๆ (เลข QT ไปอยู่หัวข้อ "เอกสารอ้างอิง" แห่งเดียว)
function clean(s?: string): string {
    return (s ?? '')
        .split('\n')
        .filter((line) => !MONEY_LINE.test(line) && !/^\s*(อ้างอิง:\s*)?QT/i.test(line))
        .join('\n')
        .trim()
}

function qtRefs(...texts: (string | undefined)[]): string[] {
    const found = new Set<string>()
    for (const t of texts) for (const m of (t ?? '').matchAll(QT_REF)) found.add(m[0])
    return [...found]
}

function section(title: string, body: string | (string | undefined)[] | undefined): string {
    const text = Array.isArray(body) ? body.filter(Boolean).join('\n') : (body ?? '').trim()
    return text ? `${title}\n${text}` : ''
}

// ลำดับหัวข้อ: เลขงาน → งานที่ต้องทำ → เครื่องเป้าหมาย → อะไหล่ → ติดต่อและเข้าหน้างาน
//              → ส่งมอบงาน → ข้อเน้นย้ำ → ข้อมูลแอร์ในร้าน → เอกสารอ้างอิง
export function buildEventDescription(input: CalendarTemplateInput): string {
    const addressText = (input.address ?? '').replace(URL_RE, '').trim()
    const mapUrl = (input.address ?? '').match(URL_RE)?.[0]

    const contact = input.contactName?.trim()
        ? `ผู้ติดต่อ: ${input.contactName.trim()}${input.phone ? ` ${input.phone}` : ''}`
        : input.phone ? `เบอร์โทร: ${input.phone}` : ''

    const blocks = [
        `เลขที่งาน: ${input.requestNo}\nลูกค้า: ${input.customerName}`,
        section('งานที่ต้องทำ', clean(input.description)),
        section('เครื่องเป้าหมาย', clean(input.machines)),
        section('อะไหล่และอุปกรณ์ที่ต้องเตรียม', clean(input.parts)),
        section('ติดต่อและเข้าหน้างาน', [contact, addressText && `สถานที่: ${addressText}`, mapUrl && `แผนที่: ${mapUrl}`]),
        section('ส่งมอบงาน', clean(input.handover)),
        section('ข้อเน้นย้ำ', clean(input.notes)),
        section('ข้อมูลแอร์ในร้าน', clean(input.acInfo)),
        section('เอกสารอ้างอิง', qtRefs(input.description, input.notes).join('\n')),
    ]
    return blocks.filter(Boolean).join('\n\n')
}

// ค้นหาลูกค้าเก่าจากงานที่เคยลงไว้ เพื่อเติมฟอร์มให้ชื่อ/เบอร์/ที่อยู่ตรงกับของเดิม
// (ชื่อที่ไม่ตรงกันทำให้ใบเสนอราคาและชีทยอดขายคลาดเคลื่อน)

export interface CustomerSource {
    customerName: string
    contactName?: string
    phone: string
    address: string
    createdAt: string
}

export interface CustomerSuggestion {
    customerName: string
    contactName: string
    phone: string
    address: string
    jobCount: number
    emphasis?: string   // ข้อกำชับเฉพาะงาน (มาจากปฏิทินเท่านั้น)
    source?: 'jobs' | 'calendar' | 'both'
}

// รวมผลจากงานในระบบกับผลจากปฏิทิน: ชื่อเดียวกันรวมเป็นแถวเดียว ใช้ข้อมูลในระบบก่อน ช่องที่ว่างเติมจากปฏิทิน
export function mergeSuggestions(fromJobs: CustomerSuggestion[], fromCalendar: CustomerSuggestion[], limit = 8): CustomerSuggestion[] {
    const merged = new Map<string, CustomerSuggestion>()
    const clean = (s: CustomerSuggestion): CustomerSuggestion => ({
        ...s,
        contactName: cleanValue(s.contactName),
        phone: cleanValue(s.phone),
        address: cleanValue(s.address),
    })
    for (const s of fromJobs) merged.set(normalizeName(s.customerName), { ...clean(s), source: 'jobs' })
    for (const raw of fromCalendar) {
        const c = clean(raw)
        const key = normalizeName(c.customerName)
        const cur = merged.get(key)
        if (!cur) {
            merged.set(key, { ...c, source: 'calendar' })
            continue
        }
        merged.set(key, {
            ...cur,
            // ผู้ติดต่อกับเบอร์ไปเป็นคู่เดียวกันจากแหล่งเดียว ไม่เอามาผสมข้ามแหล่ง
            ...(cur.phone ? {} : { contactName: c.contactName, phone: c.phone }),
            address: cur.address || c.address,
            emphasis: c.emphasis || cur.emphasis,
            jobCount: cur.jobCount + c.jobCount,
            source: 'both',
        })
    }
    return [...merged.values()].slice(0, limit)
}

// งานเก่าบางงานกรอก "*" "-" ฯลฯ เพื่อข้ามช่องบังคับ ถือว่าเป็นค่าว่าง
const PLACEHOLDER = /^[\s*\-–—_.'"?]*$|^(ไม่มี|ไม่ระบุ|n\/a)$/i
export const cleanValue = (s?: string): string => {
    const v = (s ?? '').trim()
    return PLACEHOLDER.test(v) ? '' : v
}

const normalizeName = (s: string) => s.toLowerCase().replace(/\s+/g, '')
const digitsOnly = (s: string) => s.replace(/\D/g, '')
const timeOf = (s: string) => {
    const t = Date.parse(s)
    return Number.isNaN(t) ? 0 : t
}

export function searchCustomers(requests: CustomerSource[], query: string, limit = 6): CustomerSuggestion[] {
    const q = normalizeName(query.trim())
    const qDigits = digitsOnly(query)
    if (q.length < 2) return []

    // latest = งานล่าสุด (ใช้ชื่อ), withPhone/withAddress = งานล่าสุดที่ช่องนั้นมีค่าจริง (ไม่ใช่ "*" ฯลฯ)
    type Group = { latest: CustomerSource; withPhone?: CustomerSource; withAddress?: CustomerSource; count: number }
    const isNewer = (a: CustomerSource, b?: CustomerSource) => !b || timeOf(a.createdAt) >= timeOf(b.createdAt)

    const groups = new Map<string, Group>()
    for (const r of requests) {
        const key = normalizeName(r.customerName ?? '')
        if (!key) continue
        const matchesName = key.includes(q)
        const matchesPhone = qDigits.length >= 3 && digitsOnly(r.phone ?? '').includes(qDigits)
        if (!matchesName && !matchesPhone) continue

        const group = groups.get(key) ?? { latest: r, count: 0 }
        group.count += 1
        if (isNewer(r, group.latest)) group.latest = r
        if (cleanValue(r.phone) && isNewer(r, group.withPhone)) group.withPhone = r
        if (cleanValue(r.address) && isNewer(r, group.withAddress)) group.withAddress = r
        groups.set(key, group)
    }

    return [...groups.entries()]
        .sort(([ka, a], [kb, b]) => {
            const aStarts = ka.startsWith(q) ? 0 : 1
            const bStarts = kb.startsWith(q) ? 0 : 1
            return aStarts - bStarts || b.count - a.count
        })
        .slice(0, limit)
        .map(([, { latest, withPhone, withAddress, count }]) => ({
            customerName: latest.customerName,
            // ผู้ติดต่อกับเบอร์มาจากงานเดียวกันเสมอ
            contactName: withPhone ? cleanValue(withPhone.contactName) : cleanValue(latest.contactName),
            phone: withPhone ? cleanValue(withPhone.phone) : '',
            address: withAddress ? cleanValue(withAddress.address) : '',
            jobCount: count,
        }))
}

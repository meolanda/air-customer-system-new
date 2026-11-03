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
    for (const s of fromJobs) merged.set(normalizeName(s.customerName), { ...s, source: 'jobs' })
    for (const c of fromCalendar) {
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

    const groups = new Map<string, { latest: CustomerSource; count: number }>()
    for (const r of requests) {
        const key = normalizeName(r.customerName ?? '')
        if (!key) continue
        const matchesName = key.includes(q)
        const matchesPhone = qDigits.length >= 3 && digitsOnly(r.phone ?? '').includes(qDigits)
        if (!matchesName && !matchesPhone) continue

        const group = groups.get(key)
        if (!group) {
            groups.set(key, { latest: r, count: 1 })
        } else {
            group.count += 1
            if (timeOf(r.createdAt) >= timeOf(group.latest.createdAt)) group.latest = r
        }
    }

    return [...groups.entries()]
        .sort(([ka, a], [kb, b]) => {
            const aStarts = ka.startsWith(q) ? 0 : 1
            const bStarts = kb.startsWith(q) ? 0 : 1
            return aStarts - bStarts || b.count - a.count
        })
        .slice(0, limit)
        .map(([, { latest, count }]) => ({
            customerName: latest.customerName,
            contactName: latest.contactName ?? '',
            phone: latest.phone ?? '',
            address: latest.address ?? '',
            jobCount: count,
        }))
}

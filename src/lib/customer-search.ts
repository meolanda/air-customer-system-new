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
    customerCode?: string  // รหัสลูกค้าในทะเบียน Handyman (C0001...) ถ้ามีแปลว่าเป็นชื่อหลัก
    acInfo?: string        // ข้อมูลแอร์ในร้าน (ยี่ห้อ/BTU/ตำแหน่ง) จากประวัติบริการ
    aliases?: string[]     // ชื่ออื่นของร้านเดียวกันที่ทะเบียนเคยรวมไว้ (ใช้รวมงานเก่าที่ชื่อสะกดต่าง)
    source?: 'jobs' | 'calendar' | 'registry' | 'both'
}

// รวมผลจากปฏิทิน/ทะเบียนลูกค้า (Apps Script) กับงานในระบบ เป็นรายการเดียวต่อร้าน
// - รายการที่มีรหัสลูกค้า (ทะเบียน Handyman) คือชื่อหลัก: ใช้ชื่อ/เบอร์/ที่อยู่ของทะเบียนก่อน ช่องที่ว่างเติมจากงานเก่า
//   และงานเก่าที่ชื่อตรงกับชื่อหลักหรือชื่ออื่นที่เคยรวมไว้ (aliases) จะถูกรวมเข้าแถวเดียวกัน
// - ร้านที่ไม่อยู่ในทะเบียน: ใช้ข้อมูลในระบบก่อน ช่องที่ว่างเติมจากปฏิทิน
export function mergeSuggestions(fromJobs: CustomerSuggestion[], fromCalendar: CustomerSuggestion[], limit = 8): CustomerSuggestion[] {
    const clean = (s: CustomerSuggestion): CustomerSuggestion => ({
        ...s,
        contactName: cleanValue(s.contactName),
        phone: cleanValue(s.phone),
        address: cleanValue(s.address),
    })

    const merged = new Map<string, CustomerSuggestion>()
    const aliasToKey = new Map<string, string>()
    const looseToKeys = new Map<string, Set<string>>()  // คีย์แบบหลวม → ร้านในทะเบียน (ต้องตรงร้านเดียวถึงจะรวม)
    for (const raw of fromCalendar) {
        const c = clean(raw)
        const key = normalizeName(c.customerName)
        merged.set(key, { ...c, source: c.customerCode ? 'registry' : 'calendar' })
        for (const alias of c.aliases ?? []) aliasToKey.set(normalizeName(alias), key)
        if (c.customerCode) {
            for (const name of [c.customerName, ...(c.aliases ?? [])]) {
                const loose = looseKey(name)
                if (loose.length >= LOOSE_KEY_MIN_LENGTH) looseToKeys.set(loose, (looseToKeys.get(loose) ?? new Set()).add(key))
            }
        }
    }
    const looseMatch = (name: string): string | undefined => {
        const keys = looseToKeys.get(looseKey(name))
        return keys && keys.size === 1 && looseKey(name).length >= LOOSE_KEY_MIN_LENGTH ? [...keys][0] : undefined
    }

    for (const raw of fromJobs) {
        const j = clean(raw)
        const jobKey = normalizeName(j.customerName)
        const key = merged.has(jobKey) ? jobKey : aliasToKey.get(jobKey) ?? looseMatch(j.customerName)
        const cur = key ? merged.get(key) : undefined
        if (!key || !cur) {
            merged.set(jobKey, { ...j, source: 'jobs' })
            continue
        }
        if (cur.customerCode) {
            merged.set(key, {
                ...cur,
                contactName: cur.phone ? cur.contactName : j.contactName,
                phone: cur.phone || j.phone,
                address: cur.address || j.address,
                jobCount: cur.jobCount + j.jobCount,
                source: 'both',
            })
        } else {
            merged.set(key, {
                ...j,
                // ผู้ติดต่อกับเบอร์ไปเป็นคู่เดียวกันจากแหล่งเดียว ไม่เอามาผสมข้ามแหล่ง
                ...(j.phone ? {} : { contactName: cur.contactName, phone: cur.phone }),
                address: j.address || cur.address,
                emphasis: cur.emphasis,
                acInfo: cur.acInfo,
                jobCount: j.jobCount + cur.jobCount,
                source: 'both',
            })
        }
    }

    // รายการที่มีรหัสลูกค้า (ชื่อหลักจากทะเบียน) ขึ้นก่อน
    const rank = (s: CustomerSuggestion) => (s.customerCode ? 0 : 1)
    return [...merged.values()].sort((a, b) => rank(a) - rank(b)).slice(0, limit)
}

// งานเก่าบางงานกรอก "*" "-" ฯลฯ เพื่อข้ามช่องบังคับ ถือว่าเป็นค่าว่าง
const PLACEHOLDER = /^[\s*\-–—_.'"?]*$|^(ไม่มี|ไม่ระบุ|n\/a)$/i
export const cleanValue = (s?: string): string => {
    const v = (s ?? '').trim()
    return PLACEHOLDER.test(v) ? '' : v
}

const normalizeName = (s: string) => s.toLowerCase().replace(/\s+/g, '')

// คีย์แบบหลวม: จับคู่ชื่อที่ต่างแค่เว้นวรรค / คำว่าสาขา / คำต่อท้ายงาน (กติกาเดียวกับตาราง "รวมชื่อลูกค้า" ของทีม)
// ต้องตรงกับ looseCustomerKey_ ใน Code.gs (scripts/check-calendar-pattern.ts เช็กให้)
export const LOOSE_KEY_MIN_LENGTH = 6
export function looseKey(name: string): string {
    return name
        .toLowerCase()
        .replace(/^\s*เสนอราคา\s*[-–—:]?\s*/, '')
        .replace(/^\s*pm\s+/, '')
        .replace(/[[\]]/g, ' ')
        .replace(/\([^)]*\)/g, ' ')
        .replace(/\s*[-–—]\s*(wo[\w\-/]*.*|ซ่อม.*|ล้าง.*|ตรวจ.*|ติดตั้ง.*)$/i, ' ')
        .replace(/เข้าได้เวลา.*$/, ' ')
        .replace(/สาขา/g, ' ')
        .replace(/['’`]/g, '')
        .replace(/\s+/g, '')
}
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

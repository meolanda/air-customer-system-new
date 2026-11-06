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
        address: cleanAddress(s.address, s.customerName),
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
    // คัดร้านที่วงเล็บบอกสาขาขัดแย้งออกก่อน แล้วรวมเฉพาะเมื่อเหลือร้านเดียว
    const looseMatch = (name: string): string | undefined => {
        const loose = looseKey(name)
        if (loose.length < LOOSE_KEY_MIN_LENGTH) return undefined
        const compatible = [...(looseToKeys.get(loose) ?? [])].filter((k) => {
            const shop = merged.get(k)
            return shop ? [shop.customerName, ...(shop.aliases ?? [])].some((n) => !parenConflict(name, n)) : false
        })
        return compatible.length === 1 ? compatible[0] : undefined
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
// รวมเบอร์ที่เป็นศูนย์ล้วน ("000") ด้วย
const PLACEHOLDER = /^[\s*\-–—_.'"?]*$|^(ไม่มี|ไม่ระบุ|n\/a)$|^0+$/i
export const cleanValue = (s?: string): string => {
    const v = (s ?? '').trim()
    return PLACEHOLDER.test(v) ? '' : v
}

// ที่อยู่ที่เขียนซ้ำเป็นชื่อร้านเอง ไม่ใช่ที่อยู่จริง ถือเป็นค่าว่าง
export function cleanAddress(address: string | undefined, customerName: string): string {
    const v = cleanValue(address)
    return v && normalizeName(v) === normalizeName(customerName) ? '' : v
}

// ข้อเน้นย้ำมักเป็นหัวข้อสลับกับข้อย่อย ("ใบรายงาน" / "- นำใบรายงานไปด้วย...") ในรายการแนะนำโชว์ข้อย่อยก่อน
// ถ้าไม่มีข้อย่อยเลย (เขียนเป็นบรรทัดธรรมดา) โชว์บรรทัดแรกๆ แทน
export function emphasisPreview(emphasis: string, maxLines = 2): string {
    const lines = emphasis.split('\n').map((l) => l.trim()).filter(Boolean)
    const bullets = lines.filter((l) => /^([-•*]|\d+[.)])\s*/.test(l)).map((l) => l.replace(/^([-•*]|\d+[.)])\s*/, ''))
    return (bullets.length ? bullets : lines).slice(0, maxLines).join(' · ')
}

const normalizeName = (s: string) => s.toLowerCase().replace(/\s+/g, '')

// คีย์แบบหลวม: จับคู่ชื่อที่ต่างแค่เว้นวรรค / คำว่าสาขา / คำต่อท้ายงาน (กติกาเดียวกับตาราง "รวมชื่อลูกค้า" ของทีม)
// ต้องตรงกับ looseCustomerKey_ ใน Code.gs (scripts/check-calendar-pattern.ts เช็กให้)
export const LOOSE_KEY_MIN_LENGTH = 6

// ข้อความในวงเล็บที่ "เป็นตัวตน" (ไม่นับหมายเหตุงานอย่าง (ซ่อม) (รออะไหล่) (PM)) เช่น (BBT บางบัวทอง) vs (MTU เมืองทอง)
// สองชื่อที่มีตัวตนในวงเล็บทั้งคู่และไม่เหมือนกัน = คนละสาขา ห้ามรวม — ต้องตรงกับ parenIdentityKey_ ใน Code.gs
const PAREN_NOTE_RE = /^(ซ่อม|ล้าง|ตรวจ|ติดตั้ง|รออะไหล่|อะไหล่|pm)/
export function parenIdentityKey(name: string): string {
    return (name.toLowerCase().match(/\([^)]*\)/g) ?? [])
        .map((p) => p.slice(1, -1).replace(/['’`\s]/g, ''))
        .filter((p) => p && !PAREN_NOTE_RE.test(p))
        .join('')
}
export function parenConflict(a: string, b: string): boolean {
    const ka = parenIdentityKey(a)
    const kb = parenIdentityKey(b)
    return ka !== '' && kb !== '' && ka !== kb
}
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
        if (cleanAddress(r.address, r.customerName) && isNewer(r, group.withAddress)) group.withAddress = r
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
            address: withAddress ? cleanAddress(withAddress.address, withAddress.customerName) : '',
            jobCount: count,
        }))
}

// ---------- จับคู่ร้านอัตโนมัติหลัง AI อ่านข้อความ/รูป/PDF/เสียง ----------
// AI แยกชื่อ/ที่อยู่/เบอร์ออกมาให้ (เช่น ชื่อ "KFC" + ที่อยู่ "เซ็นทรัลวิลเลจ") ตรงนี้เอาไปเทียบกับรายชื่อที่ค้นได้
// - เจอร้านเดียวชัดเจน → confident (เติมข้อมูลของร้านให้เลย)
// - หลายร้านใกล้เคียง/ไม่ชัด → choose (ให้คนเลือก ไม่เดา)
// - ไม่เจอ → none (ลูกค้าใหม่หรือชื่อไม่ตรง)

export interface AiExtract {
    customerName?: string
    address?: string
    phone?: string
    contactName?: string
}

export type AiMatch =
    | { kind: 'confident'; suggestion: CustomerSuggestion }
    | { kind: 'choose'; options: CustomerSuggestion[] }
    | { kind: 'none' }

// คำค้นที่ใช้ดึงตัวเลือกมา: ที่อยู่/ชื่อ/ชื่อ+ที่อยู่/เบอร์ (ตัวค้นต้องการอย่างน้อย 2 ตัวอักษร)
export function aiQueries(x: AiExtract): string[] {
    const name = (x.customerName ?? '').trim()
    const address = (x.address ?? '').trim()
    const phone = digitsOnly(x.phone ?? '')
    const queries = [address, name, `${name} ${address}`.trim(), phone.length >= 7 ? phone : '']
    return [...new Set(queries.filter((q) => normalizeName(q).length >= 2))]
}

const tokensOf = (s?: string): string[] =>
    (s ?? '')
        .toLowerCase()
        .replace(/สาขา/g, ' ')
        .replace(/[()[\]'’`.,\-_/]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length >= 2)

export function pickAiMatch(x: AiExtract, candidates: CustomerSuggestion[]): AiMatch {
    const nameTokens = tokensOf(x.customerName)
    const addrTokens = tokensOf(x.address)
    const phone = digitsOnly(x.phone ?? '')
    const hasAddr = addrTokens.length > 0

    const scored = candidates.map((c) => {
        const names = normalizeName([c.customerName, ...(c.aliases ?? [])].join(' '))
        const withAddress = normalizeName(`${[c.customerName, ...(c.aliases ?? [])].join(' ')} ${c.address}`)
        const nameHit = nameTokens.filter((t) => names.includes(t)).length
        const addrHit = addrTokens.filter((t) => withAddress.includes(t)).length
        const nameAll = nameTokens.length > 0 && nameHit === nameTokens.length
        const phoneHit = phone.length >= 7 && digitsOnly(c.phone).slice(-7) === phone.slice(-7)
        const strong = phoneHit || (nameAll && hasAddr && addrHit >= 1) || (nameAll && !hasAddr && nameTokens.join('').length >= 8)
        return { c, score: nameHit * 2 + addrHit * 2 + (phoneHit ? 5 : 0), strong }
    })

    const strong = scored.filter((s) => s.strong).sort((a, b) => b.score - a.score)
    const [top, second] = strong
    if (top && (strong.length === 1 || top.score - (second?.score ?? 0) >= 2)) {
        return { kind: 'confident', suggestion: top.c }
    }
    const options = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 3).map((s) => s.c)
    return options.length ? { kind: 'choose', options } : { kind: 'none' }
}

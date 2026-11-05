// เช็กว่ากฎใน Apps Script (Code.gs) ตรงกับฝั่งเว็บ
//   1) เทมเพลตปฏิทิน src/lib/calendar-template.ts: regex เรื่องเงิน + คำนำหน้าข้อเน้นย้ำ
//   2) คีย์แบบหลวมจับคู่ชื่อร้าน src/lib/customer-search.ts: looseKey ต้องให้ผลเหมือน looseCustomerKey_
// รัน: bun scripts/check-calendar-pattern.ts   (แก้ฝั่งหนึ่งแล้วต้องแก้อีกฝั่งให้ตรง และ clasp push)
import { readFileSync } from 'fs'
import { runInNewContext } from 'vm'
import { EMPHASIS_MARKERS, MONEY_LINE_SOURCE } from '../src/lib/calendar-template'
import { looseKey } from '../src/lib/customer-search'

const gs = readFileSync('download/google-apps-script/Code.gs', 'utf8')
const failures: string[] = []

// ใน TS เก็บเป็นสตริง (\\d) ใน Code.gs เป็น regex literal (\d)
if (!gs.includes(MONEY_LINE_SOURCE.replace(/\\\\/g, '\\'))) failures.push('MONEY_LINE ใน Code.gs ไม่ตรงกับเทมเพลต')
if (!gs.includes(`/${EMPHASIS_MARKERS.join('|')}/`)) failures.push('คำนำหน้าข้อเน้นย้ำใน Code.gs ไม่ตรงกับเทมเพลต')

// รัน looseCustomerKey_ จาก Code.gs จริง แล้วเทียบกับ looseKey ฝั่งเว็บกับชื่อตัวอย่าง
const gsLooseKey = runInNewContext(`${gs}\nlooseCustomerKey_`, {}) as (name: string) => string
const samples = [
    "Santa Fe'Steak สาขา เทอร์มินอล21 พระราม 3",
    'QSA KFC Wood Smith Village (วู้ด สมิธ วิลเลจ) -ซ่อม',
    'เสนอราคา QSA KFC Wood Smith Village (วู้ด สมิธ วิลเลจ)',
    'QSA KFC Wood Smith Village (วู้ด สมิธ วิลเลจ) - WO26-141615',
    '[KFC] เซ็นทรัล วิลเลจ',
    'KFC เซ็นทรัลวิลเลจ เข้าได้เวลา 21.00 หรือ 21.30 น.',
    'KFC เซ็นทรัลวิลเลจ (ซ่อม)',
    'ร้านทดสอบ สาขา A',
    'KFC',
    'เสนอราคา - [STN] ถนนพรานนก-พุทธมณฑล (ขาเข้า)',
    "เสนอราคา - Santa Fe'Steak สาขา ซีคอน บางแค",
    'QSA KFC Seacon Bangkae (ซีคอนบางแค) - ตรวจสอบ',
    'QSA KFC Seacon Bangkae (ซีคอนบางแค) - ติดตั้ง',
    "PM Santa Fe'Steak สาขา ซีคอนสแควร์ ศรีนครินทร์",
    'pm  KFC เซ็นทรัลวิลเลจ',
    'PMK Cafe สาขาทดสอบ',
]
for (const s of samples) {
    if (looseKey(s) !== gsLooseKey(s)) failures.push(`looseKey ไม่ตรงกับ looseCustomerKey_ ที่ชื่อ "${s}"`)
}

if (failures.length) {
    console.error(failures.map((f) => `✗ ${f}`).join('\n'))
    process.exit(1)
}
console.log('✓ กฎปฏิทินและคีย์จับคู่ชื่อใน Code.gs ตรงกับฝั่งเว็บ')

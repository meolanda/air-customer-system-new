// เช็กว่ากฎปฏิทินใน Apps Script (Code.gs) ตรงกับเทมเพลตกลาง src/lib/calendar-template.ts
// รัน: bun scripts/check-calendar-pattern.ts   (แก้เทมเพลตแล้วต้องแก้ Code.gs ให้ตรง และ clasp push)
import { readFileSync } from 'fs'
import { EMPHASIS_MARKERS, MONEY_LINE_SOURCE } from '../src/lib/calendar-template'

const gs = readFileSync('download/google-apps-script/Code.gs', 'utf8')
const failures: string[] = []

// ใน TS เก็บเป็นสตริง (\\d) ใน Code.gs เป็น regex literal (\d)
if (!gs.includes(MONEY_LINE_SOURCE.replace(/\\\\/g, '\\'))) failures.push('MONEY_LINE ใน Code.gs ไม่ตรงกับเทมเพลต')
if (!gs.includes(`/${EMPHASIS_MARKERS.join('|')}/`)) failures.push('คำนำหน้าข้อเน้นย้ำใน Code.gs ไม่ตรงกับเทมเพลต')

if (failures.length) {
    console.error(failures.map((f) => `✗ ${f}`).join('\n'))
    process.exit(1)
}
console.log('✓ กฎปฏิทินใน Code.gs ตรงกับเทมเพลตกลาง')

# แผนการแก้ไขโปรเจค: ระบบรับงานบริการแอร์

> สร้างโดย: Claude Code | วันที่: 2026-03-02
> อ้างอิงจาก: Code Review Session

---

## สรุปปัญหาทั้งหมด

| # | ระดับ | ปัญหา | ไฟล์ที่เกี่ยวข้อง |
|---|-------|--------|------------------|
| 1 | 🔴 Critical | Status Type มี 3 ชุดขัดแย้งกัน | `page.tsx`, `STATUS_WORKFLOW.ts`, `js.html` |
| 2 | 🔴 Critical | GAS js.html แก้แล้วแต่ยังไม่ deploy | `download/google-apps-script/js.html` |
| 3 | 🟡 Medium | `page.tsx` monolithic 893 บรรทัด | `src/app/page.tsx` |
| 4 | 🟡 Medium | ไม่มี try/catch ใน updateStatus / deleteRequest | `src/app/page.tsx` |
| 5 | 🟡 Medium | Git ค้าง — ไฟล์ modified + untracked ไม่ได้ commit | `Code.gs`, `appsscript.json`, `js.html`, `features.json` |
| 6 | 🟢 Minor | Prisma schema ไม่ reflect domain จริง | `prisma/schema.prisma` |
| 7 | 🟢 Minor | `STATUS_WORKFLOW.ts` เป็น dead code (ไม่มีใคร import) | `src/lib/STATUS_WORKFLOW.ts` |

---

## แผนดำเนินการ (เรียงลำดับ)

---

### ขั้นที่ 1 — กำหนด Status ชุดเดียวให้ทั้งระบบ (Critical)

**ปัญหา:** มี 3 ชุด Status ที่ไม่ตรงกัน

- `STATUS_WORKFLOW.ts`: `waiting_quote | checking_parts | send_quote | waiting_response | completed`
- `page.tsx` local: `scheduled | quotation | check_parts | waiting_send | sent`
- `js.html` (GAS): ชุดที่ 3 (ต้องตรวจสอบ)

**วิธีแก้:** เลือกใช้ชุดจาก `STATUS_WORKFLOW.ts` เป็น source of truth เพราะออกแบบมาแล้วและตรงกับ business logic ใน PRD

**Status ที่ถูกต้อง (8 statuses):**

```
new              → รับเรื่องใหม่
queue            → จองคิว / นัดหมาย
waiting_quote    → ขอใบเสนอราคา
checking_parts   → เช็คอะไหล่ + เสนอราคา
send_quote       → ส่งใบเสนอราคาแล้ว
waiting_response → รอลูกค้าตอบกลับ
completed        → เสร็จสิ้น
cancelled        → ยกเลิก
```

**ไฟล์ที่ต้องแก้:**

1. **`src/app/page.tsx`**
   - แก้ `type Status` ให้ตรงกับ `StatusValue` ใน STATUS_WORKFLOW.ts
   - แก้ `STATUS_CONFIG` (local) ให้ตรงกับ statuses ใหม่
   - แก้ `STATUS_TRANSITIONS` ให้ตรงกับ `nextStatuses` ใน STATUS_WORKFLOW.ts
   - แก้ `STATUS_BY_DEPARTMENT` ให้ map department → statuses ใหม่
   - ลบ `scheduled`, `quotation` (ชื่อเก่า), `check_parts`, `waiting_send`, `sent` ออก

2. **`src/lib/STATUS_WORKFLOW.ts`**
   - export ให้ใช้งานได้จริง (ปัจจุบันเป็น dead code)
   - พิจารณา import มาใช้ใน page.tsx แทนการนิยามซ้ำ

3. **`download/google-apps-script/js.html`**
   - ตรวจสอบและ sync Status names ให้ตรงกับชุดใหม่
   - แก้ department filtering logic ให้ใช้ statuses ใหม่

4. **`download/google-apps-script/Code.gs`**
   - ตรวจสอบ status string ที่ใช้ใน GAS backend

**Acceptance Criteria:**
- [ ] ทั้ง `page.tsx` และ `STATUS_WORKFLOW.ts` ใช้ status string เดียวกัน
- [ ] ทั้ง GAS `js.html` ใช้ status string เดียวกัน
- [ ] TypeScript compile ไม่มี error
- [ ] Status badge แสดงผลถูกต้อง

---

### ขั้นที่ 2 — แก้ Department Filtering ใน page.tsx (ตามมาจากขั้นที่ 1)

**ปัญหา:** `STATUS_BY_DEPARTMENT` ใช้ statuses เก่า ทำให้ filter ผิด

**ปัจจุบัน (ผิด):**
```ts
const STATUS_BY_DEPARTMENT: Record<Department, Status[]> = {
  admin: ['new', 'queue', 'scheduled', 'waiting_send'],   // scheduled ไม่มีแล้ว
  quotation: ['quotation'],                                // quotation ไม่มีแล้ว
  procurement: ['check_parts']                             // check_parts ไม่มีแล้ว
}
```

**แก้เป็น (ตาม Business Logic):**
```ts
const STATUS_BY_DEPARTMENT: Record<Department, Status[]> = {
  admin: ['new', 'queue', 'send_quote', 'waiting_response', 'completed', 'cancelled'],
  quotation: ['waiting_quote'],
  procurement: ['checking_parts']
}
```

**Acceptance Criteria:**
- [ ] ฝ่ายแอดมิน เห็นงานทุกสถานะ (หรือกรอง admin statuses)
- [ ] ฝ่ายใบเสนอราคา เห็นเฉพาะ `waiting_quote`
- [ ] ฝ่ายจัดซื้อ เห็นเฉพาะ `checking_parts`

---

### ขั้นที่ 3 — Deploy GAS Manual (Critical)

**ปัญหา:** `clasp` auth error → js.html ที่แก้ไขยังไม่ได้ขึ้น Google Apps Script จริง

**ขั้นตอน Manual Deploy:**
1. เปิด: `https://script.google.com/d/1craABvtLZS8O67dLJXrAP50oZoPLUssiTyI60Kh5k_mHTf7K3iY29Liy/edit`
2. เปิดไฟล์ `js.html` ใน sidebar
3. Copy โค้ดทั้งหมดจาก `download/google-apps-script/js.html` (local)
4. Replace โค้ดเดิมใน editor
5. กด Save (Ctrl+S)
6. กด **Deploy > Manage deployments**
7. เลือก deployment ที่มีอยู่ > กด ✏️ Edit
8. เลือก "New version"
9. กด Deploy
10. ทดสอบที่ Web App URL

**Acceptance Criteria:**
- [ ] เปิด Web App URL แล้วไม่ error
- [ ] Login ด้วยแอดมินได้
- [ ] Department filtering ทำงาน

---

### ขั้นที่ 4 — เพิ่ม Error Handling (Medium)

**ปัญหา:** `updateStatus()` และ `deleteRequest()` ใน page.tsx ไม่มี try/catch

**กรณีที่เกิดปัญหา:**
- Google Sheets API ล้มเหลว → React state อัปเดตแต่ server ไม่อัปเดต → ข้อมูลผิดพลาด

**วิธีแก้ `updateStatus`:**
```ts
const updateStatus = async (id: string, newStatus: Status) => {
  const request = requests.find(r => r.id === id)
  if (!request) return

  const updatedRequest = { ...request, status: newStatus, history: [...] }

  try {
    if (isGoogleConfigured) {
      const res = await fetch('/api/sheets', { method: 'PUT', ... })
      if (!res.ok) throw new Error('API error')
    }
    setRequests(prev => prev.map(r => r.id === id ? updatedRequest : r))
  } catch (error) {
    console.error('Error updating status:', error)
    alert('อัปเดตสถานะไม่สำเร็จ กรุณาลองใหม่')
    // ไม่อัปเดต state ถ้า API ล้มเหลว
  }
}
```

**วิธีแก้ `deleteRequest`:**
```ts
const deleteRequest = async (id: string) => {
  if (!confirm('ยืนยันการลบรายการนี้?')) return

  try {
    if (isGoogleConfigured) {
      const res = await fetch(`/api/sheets?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('API error')
    }
    setRequests(prev => prev.filter(r => r.id !== id))
  } catch (error) {
    console.error('Error deleting:', error)
    alert('ลบไม่สำเร็จ กรุณาลองใหม่')
  }
}
```

**Acceptance Criteria:**
- [ ] ถ้า API ล้มเหลว → แสดง alert และ state ไม่เปลี่ยน
- [ ] ถ้า API สำเร็จ → state อัปเดต

---

### ขั้นที่ 5 — Commit ไฟล์ค้างทั้งหมด (Medium)

**ปัจจุบัน (git status):**
```
M  download/google-apps-script/Code.gs
M  download/google-apps-script/appsscript.json
M  download/google-apps-script/js.html
?? features.json
```

**แผน:**
1. หลังจากแก้ Status mismatch (ขั้นที่ 1-2) เสร็จ → commit รวมกัน
2. Commit 1: `feat: Fix status type mismatch across all layers`
3. Commit 2: `feat: Add error handling for API calls`
4. Commit 3: `chore: Track features.json and GAS updates`

**Acceptance Criteria:**
- [ ] `git status` สะอาด ไม่มีไฟล์ค้าง
- [ ] Commit message สื่อความหมาย

---

### ขั้นที่ 6 — แยก page.tsx ออกเป็น Components (Medium)

**ปัญหา:** 893 บรรทัดใน 1 ไฟล์ ยาก maintain

**โครงสร้างใหม่ที่แนะนำ:**
```
src/
├── app/
│   ├── page.tsx              # ← เหลือแค่ root state + orchestration (~150 บรรทัด)
│   └── layout.tsx
├── components/
│   ├── LoginScreen.tsx       # หน้า login เลือกผู้ใช้ (~80 บรรทัด)
│   ├── Header.tsx            # header + logout + storage indicator (~60 บรรทัด)
│   ├── StatsBar.tsx          # 3 stat cards (~40 บรรทัด)
│   ├── SearchBar.tsx         # search + filter + refresh (~50 บรรทัด)
│   ├── JobList.tsx           # รายการงาน + loading/empty states (~60 บรรทัด)
│   ├── JobCard.tsx           # card งาน 1 ชิ้น + buttons + history (~120 บรรทัด)
│   └── JobModal.tsx          # modal form เพิ่ม/แก้ไขงาน (~200 บรรทัด)
└── lib/
    ├── STATUS_WORKFLOW.ts    # single source of truth ← ใช้จริง
    ├── api.ts                # fetch wrappers (sheets API calls)
    └── utils.ts
```

**Acceptance Criteria:**
- [ ] ไม่มีไฟล์ไหนยาวเกิน 300 บรรทัด
- [ ] `page.tsx` เป็นแค่ orchestrator
- [ ] TypeScript compile ไม่มี error
- [ ] UI ทำงานเหมือนเดิม

---

### ขั้นที่ 7 — ทำให้ STATUS_WORKFLOW.ts ถูกใช้จริง (Minor)

**ปัญหา:** มีโค้ดดี ๆ ใน `STATUS_WORKFLOW.ts` แต่ไม่มีใคร import

**วิธีแก้ (ทำหลังจากขั้นที่ 6):**
- ใน `page.tsx` (หรือ `JobCard.tsx` ใหม่) import และใช้:
  ```ts
  import { STATUS_CONFIG, getNextStatuses, canTransitionTo } from '@/lib/STATUS_WORKFLOW'
  ```
- ลบ `STATUS_CONFIG` local ที่ duplicate ออก
- ลบ `STATUS_TRANSITIONS` local และใช้ `getNextStatuses()` แทน

**Acceptance Criteria:**
- [ ] ไม่มี Status config ซ้ำซ้อน
- [ ] `STATUS_WORKFLOW.ts` เป็น single source of truth

---

### ขั้นที่ 8 — อัปเดต Prisma Schema ให้ตรง Domain (Minor)

**ปัญหา:** Schema มีแค่ `User` + `Post` generic ไม่ได้ใช้งานจริง

**ปัจจุบัน (ไม่ตรง domain):**
```prisma
model User { id Int, email String, name String, posts Post[] }
model Post { id Int, title String, content String, author User }
```

**แก้เป็น (ถ้าต้องการใช้ SQLite จริง):**
```prisma
model ServiceRequest {
  id            String   @id @default(cuid())
  requestNo     String   @unique
  createdAt     DateTime @default(now())
  channel       String
  customerName  String
  phone         String
  address       String?
  serviceType   String
  description   String?
  priority      String   @default("normal")
  status        String   @default("new")
  appointmentDate DateTime?
  notes         String?
  imageUrl      String?
  history       Json     @default("[]")
}

model AppUser {
  id         String @id
  name       String
  department String
}
```

**หมายเหตุ:** ถ้าใช้ Google Sheets เป็น primary database ตลอด ขั้นนี้ไม่จำเป็นเร่งด่วน

**Acceptance Criteria:**
- [ ] Schema ตรงกับ domain model จริง
- [ ] `npx prisma db push` ไม่มี error

---

## ลำดับความสำคัญ (TL;DR)

```
ขั้นที่ 1: Fix Status Mismatch      ← ทำก่อนสุด (Critical, unblocks ทุกอย่าง)
ขั้นที่ 2: Fix Department Filtering  ← ทำพร้อมกับขั้นที่ 1
ขั้นที่ 3: Deploy GAS Manual        ← ทำหลังขั้นที่ 1-2 (ต้องทำ manual)
ขั้นที่ 4: Add Error Handling       ← ทำหลังขั้นที่ 3
ขั้นที่ 5: Commit ทุกอย่าง         ← ทำหลังขั้นที่ 1-4
ขั้นที่ 6: Split page.tsx           ← ทำเมื่อมีเวลา
ขั้นที่ 7: Use STATUS_WORKFLOW.ts   ← ทำพร้อมกับขั้นที่ 6
ขั้นที่ 8: Fix Prisma Schema        ← ทำสุดท้าย (ไม่เร่งด่วน)
```

---

## สถานะการทดสอบหลังแก้ไข

หลังทำขั้นที่ 1-3 เสร็จ ให้ทดสอบตาม features.json Phase 2:

- [ ] **feature-2-1**: Department filtering ทำงาน (deploy GAS แล้ว)
- [ ] **feature-2-2**: Login ด้วยแอดมิน → เห็นหน้าหลัก
- [ ] **feature-2-3**: สร้างงานใหม่ → บันทึกลง Google Sheets
- [ ] **feature-2-4**: เปลี่ยนสถานะงาน → ประวัติอัปเดต
- [ ] **feature-2-5**: Login ต่างฝ่าย → เห็นงานตาม department
- [ ] **feature-2-6**: Google Sheets Sync → ข้อมูลถูกต้อง

---

*อัปเดต PLAN.md นี้เมื่อแต่ละขั้นเสร็จ*

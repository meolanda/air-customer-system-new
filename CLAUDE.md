# CLAUDE.md — ระบบรับงานบริการแอร์

## 🧭 ภาพรวมโปรเจกต์

ระบบบริหารจัดการงานบริการแอร์คอนดิชั่น สำหรับทีม 8 คน ใช้ผ่านมือถือเป็นหลัก (ติดตั้งเป็น PWA ได้)

- **Production:** https://air-customer-system-new.vercel.app (deploy อัตโนมัติจาก `main` บน Vercel)
- **Repository:** https://github.com/meolanda/air-customer-system-new

**Stack:**
- Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS + shadcn/ui
- **ฐานข้อมูลหลัก: Firebase Realtime Database** (`serviceRequests/{id}`) — หน้าเว็บอ่าน/เขียนตรงแบบเรียลไทม์
- **Google Sheets** = สำเนา/รายงาน (ซิงก์ผ่าน `/api/sheets`) และแหล่งนำเข้าเมื่อ Firebase ว่าง (`/api/import`)
- **Google Drive** = เก็บรูปและไฟล์แนบ (`/api/upload`)
- Google Calendar = นัดหมาย, Telegram = แจ้งเตือน, Gemini = AI ช่วยเติมข้อมูลจากข้อความ/รูป/PDF
- ❌ **ไม่ใช้ Firebase Storage** (ต้องใช้แผน Blaze) — รูปไป Drive ทั้งหมด

> โฟลเดอร์ `download/google-apps-script/` เป็นแอป Apps Script รุ่นเก่า (legacy) **ไม่ใช่ตัว production** ดูหัวข้อท้ายไฟล์

---

## 📁 โครงสร้างไฟล์หลัก

```
src/
├── proxy.ts                      ← บังคับ session กับ /api/* ทุกตัว (ยกเว้น auth/verify-pin, auth/session)
├── app/
│   ├── page.tsx                  ← UI หลักทั้งหมด (ไฟล์เดียวยาว ~2,000 บรรทัด)
│   ├── layout.tsx                ← metadata, viewport, theme-color (PWA)
│   ├── manifest.ts               ← Web App Manifest
│   ├── pwa-icon/route.tsx        ← สร้างไอคอนแอป PNG (?size=180|192|512)
│   └── api/
│       ├── auth/verify-pin       ← ตรวจ PIN → ตั้ง cookie session
│       ├── auth/session          ← GET เช็คล็อกอิน / DELETE ออกจากระบบ
│       ├── auth/firebase-token   ← ออก Firebase custom token (ต้องมี session)
│       ├── sheets                ← CRUD ซิงก์ Google Sheets
│       ├── import                ← Sheets → Firebase (เมื่อฐานข้อมูลว่าง)
│       ├── upload                ← อัปโหลดรูป/ไฟล์ไป Google Drive
│       ├── calendar              ← สร้าง/แก้นัดหมาย Google Calendar
│       ├── telegram              ← ส่งแจ้งเตือน
│       └── ai/{analyze,analyze-image,analyze-pdf}  ← Gemini
└── lib/
    ├── session.ts                ← ออก/ตรวจ token session (HMAC-SHA256, Web Crypto)
    ├── firebase.ts               ← Firebase client SDK (Auth + Realtime DB)
    ├── firebase-server.ts        ← ฝั่งเซิร์ฟเวอร์: ออก custom token, เขียน DB ด้วยสิทธิ์ service account
    ├── pem.ts                    ← ทำความสะอาดค่า private key จาก env
    ├── api-middleware.ts         ← rate limit
    └── STATUS_WORKFLOW.ts        ← นิยามสถานะงาน
```

---

## 🔐 ระบบล็อกอิน (สำคัญ)

1. ผู้ใช้กรอก **PIN ร้านเดียวกันทั้งทีม** → `POST /api/auth/verify-pin` ตรวจกับ `STORE_PIN`
2. สำเร็จ → ตั้ง cookie `aircon_session` (httpOnly, sameSite=lax, **30 วัน**) ลงนามด้วย `SESSION_SECRET` (ถ้าไม่ตั้งใช้ `STORE_PIN`)
3. `src/proxy.ts` ตรวจ cookie ทุกครั้งที่เรียก `/api/*` — ไม่มี/ปลอม = **401**
4. หลังผ่าน PIN หน้าเว็บเรียก `/api/auth/firebase-token` แล้ว `signInWithCustomToken` เพื่อให้อ่าน/เขียน Firebase ได้
5. **ไม่มี PIN สำรอง** — ถ้าไม่ตั้ง `STORE_PIN` ล็อกอินไม่ได้ (500)
6. เลือก "ชื่อผู้ใช้" ในทีม (เช่น คุณเนย) เก็บใน `localStorage` เป็นแค่ป้ายระบุตัวตน ไม่ใช่การยืนยันสิทธิ์

**กฎ Firebase Realtime Database ต้องเป็น:**
```json
{ "rules": { ".read": "auth != null", ".write": "auth != null" } }
```
ห้ามเปลี่ยนกลับเป็น `true` — จะเปิดข้อมูลลูกค้าให้ทุกคนอ่านได้ (เคยเป็นแบบนั้นมาก่อนและถูกแก้แล้ว)
โปรเจกต์ไม่ได้เปิดวิธีล็อกอินอื่นใน Firebase Auth (ไม่มี Email/Google/Anonymous) จึงมีแต่ token ที่เซิร์ฟเวอร์ออกให้เท่านั้นที่ผ่านกฎได้

---

## 🔑 Environment Variables

ตั้งใน Vercel (Settings → Environment Variables) และ `.env.local` สำหรับรันในเครื่อง

| Key | ใช้ทำอะไร |
|-----|-----------|
| `STORE_PIN` | PIN เข้าระบบ (**บังคับ**) |
| `SESSION_SECRET` | ลงนาม cookie session (ไม่บังคับ; ไม่ตั้ง = ใช้ `STORE_PIN`) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | **เนื้อไฟล์ service account `.json` ทั้งไฟล์** ของโปรเจกต์ Firebase (ใช้ออก token + เขียน DB ฝั่งเซิร์ฟเวอร์) |
| `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` | ทางเลือกแทนตัวบน (แยกสองค่า) — ใช้เมื่อไม่ได้ตั้ง JSON |
| `NEXT_PUBLIC_FIREBASE_*` | config ฝั่งเว็บ (API_KEY, AUTH_DOMAIN, PROJECT_ID, STORAGE_BUCKET, MESSAGING_SENDER_ID, APP_ID, MEASUREMENT_ID) |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY` | service account ของ Google Cloud (Sheets/Drive/Calendar) — **คนละตัวกับของ Firebase** |
| `GOOGLE_SHEETS_ID` (+ `GOOGLE_SHEETS_TAB_NAME` ถ้ามี) | สเปรดชีตปลายทาง |
| `GOOGLE_DRIVE_FOLDER_ID` | โฟลเดอร์เก็บรูป/ไฟล์แนบ |
| `GOOGLE_CALENDAR_ID` | ปฏิทินนัดหมาย |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | แจ้งเตือน |
| `GEMINI_API_KEY` | AI |
| `API_SECRET_KEY` | (ไม่บังคับ) ใช้กับการเรียกแบบ server-to-server |

ข้อควรระวังเรื่อง env บน Vercel:
- ตัวแปรที่ตั้งเป็น **Secret** มองค่าย้อนหลังไม่ได้ (กล่อง Value ว่างตอน Edit เป็นเรื่องปกติ) อย่ากด Save ทั้งที่กล่องว่าง
- แก้ตัวแปรแล้วต้อง **Redeploy** ถึงมีผล (ทำหลังบันทึกเสร็จเท่านั้น)
- ตอนวาง `FIREBASE_SERVICE_ACCOUNT_JSON` ให้ **Ctrl+A ล้างช่องก่อน แล้ววางครั้งเดียว** (เคยวางซ้อนสองรอบจน JSON เสีย)
- ตัวแปรอาจถูกตั้งเป็น Production อย่างเดียว → Preview จะไม่มีกุญแจ ออก Firebase token ไม่ได้ (และเมื่อกฎปิดจะโหลดงานไม่ขึ้นบน Preview)
- `/api/auth/firebase-token` ถ้าเซ็นไม่ได้จะตอบ 500 พร้อม `diagnostics` (บอกแค่ลักษณะของตัวแปร ไม่เปิดเผยค่า) ดู log ได้ที่ Vercel → Logs

---

## 🔄 Status Workflow

| Status | ความหมาย |
|--------|---------|
| `new` | รับเรื่องใหม่ |
| `queue` | จองคิว / นัดหมาย |
| `waiting_quote` | ขอใบเสนอราคา |
| `checking_parts` | เช็คอะไหล่ + เสนอราคา |
| `order_parts` | แจ้งซื้ออะไหล่ (มีใน UI) |
| `send_quote` | ส่งใบเสนอราคาแล้ว |
| `waiting_response` | รอลูกค้าตอบกลับ |
| `completed` | เสร็จสิ้น |
| `cancelled` | ยกเลิก |

กติกาการเปลี่ยนสถานะอยู่ที่ `src/lib/STATUS_WORKFLOW.ts` (ไฟล์นี้ยังไม่มี `order_parts` — ตรวจให้ตรงกันถ้าแก้ workflow)

---

## 🗄️ ข้อมูลงาน

เก็บที่ Firebase `serviceRequests/{id}` (`id` = `Date.now().toString()`), คีย์หลัก:
`requestNo` (`REQ-YYYYMMDD-001`), `createdAt`, `channel`, `customerName`, `phone`, `address`, `serviceType`, `description`, `priority`, `status`, `appointmentDate` / `appointmentEndDate` / `isAllDay`, `notes`, `imageUrl` + `imageUrls[]`, `attachments[]`, `history` (`[{status, date, by}]`)

- หน้าเว็บโหลดเฉพาะงาน 90 วันล่าสุด + งานที่ยังไม่ปิด
- ทุกครั้งที่บันทึก/แก้/ลบ ระบบยิงซิงก์ไป Google Sheets (`/api/sheets`) แบบเบื้องหลัง

### รูปภาพและไฟล์
- รูปอัปโหลดผ่าน `POST /api/upload` → Google Drive → ได้ลิงก์ `drive.google.com/uc?export=view&id=...` (ตั้งสิทธิ์อ่านผ่านลิงก์)
- **ย่อรูปฝั่งเบราว์เซอร์ก่อนส่ง** (ด้านยาวสุด 1600px, JPEG 0.8) เพราะ Vercel รับ request body ได้ราว 4.5MB — ห้ามเอาขั้นตอนนี้ออก
- ชนิดไฟล์ที่รับ: รูป, PDF, Word, Excel (รูป ≤10MB, เอกสาร ≤20MB)

---

## 🚀 วิธี Deploy

```bash
git checkout -b feat/ชื่องาน
# แก้โค้ด → commit → push แล้วเปิด Pull Request บน GitHub
# Vercel สร้าง Preview ให้ทุก branch (ต้องล็อกอิน Vercel ถึงเปิดได้)
# Merge เข้า main = deploy production อัตโนมัติ
```

- ก่อน commit มี **pre-commit hook** รัน type-check, ESLint และ adversarial agent — ต้องผ่านทั้งหมด
- Preview ใช้ฐานข้อมูลเดียวกับ production — ระวังอย่าสร้างงานทดสอบทิ้งไว้
- `next.config.ts` ตั้ง `output: "standalone"` และ `typescript.ignoreBuildErrors: true` (build ไม่ล้มเพราะ type error → **ต้องรัน `npx tsc --noEmit` เองทุกครั้ง**)
- Package manager: มีทั้ง `bun.lock` และ `package-lock.json` (Vercel ใช้ npm) — อย่าลบไฟล์ใดไฟล์หนึ่งโดยไม่ตรวจ

รันในเครื่อง:
```bash
npm install
npm run dev        # http://localhost:3000
npx tsc --noEmit   # type-check
npm run lint
```
ในเครื่องต้องมี `.env.local` ตามตารางด้านบน — ถ้าไม่มี `FIREBASE_SERVICE_ACCOUNT_JSON` หน้าเว็บจะอ่านงานไม่ได้ (ฐานข้อมูลปิดสำหรับคนนอก) และอัปโหลดรูปไม่ได้ถ้าไม่มี `GOOGLE_DRIVE_FOLDER_ID`

---

## ⚠️ ข้อควรระวัง

- **ห้ามใส่ความลับใน git**: `.env*`, ไฟล์กุญแจ `*.json`, `service-customer-*.json` ถูก `.gitignore` ไว้ — ตรวจทุกครั้งก่อน commit ว่าไม่มี private key หลุด (repo เป็น public)
- ค่า private key ที่คัดลอกมาวางมักเพี้ยน (ตัดบรรทัด, มีเครื่องหมายคำพูด) — `src/lib/pem.ts` แก้ให้ระดับหนึ่ง แต่วิธีที่ปลอดภัยที่สุดคือวางทั้งไฟล์ใน `FIREBASE_SERVICE_ACCOUNT_JSON`
- `/api/*` ทุกตัวถูกป้องกันด้วย `src/proxy.ts` — route ใหม่จะถูกป้องกันอัตโนมัติ; ถ้าต้องเปิดสาธารณะให้เพิ่มใน `PUBLIC_API` (ควรหลีกเลี่ยง)
- rate limit ใน `api-middleware.ts` เก็บในหน่วยความจำของแต่ละ instance (ไม่ใช่ตัวป้องกันหลัก)
- ไม่มี `/api/test-sheets` แล้ว (เคยเปิดเผยข้อมูล service account) — อย่าสร้าง endpoint debug ที่โชว์ค่า env
- อัปเดตหน้าเว็บ: ผู้ใช้ที่เปิดแอปค้างไว้ควรรีเฟรชหลัง deploy

---

## 📱 Default Users

```
u1=คุณเนย, u2=คุณฟิล์ม, u3=คุณตุ้ม, u4=คุณดอย,
u5=คุณดอจ, u6=คุณออมสิน, u7=คุณเผือก
```

---

## 🗃️ Legacy: Google Apps Script (ไม่ใช่ production)

โฟลเดอร์ `download/google-apps-script/` (`Code.gs`, `index.html`, `css.html`, `js.html`) คือระบบรุ่นแรกที่ใช้ Apps Script + Sheets โดยตรง เก็บไว้อ้างอิง

- **GAS Script ID:** `1craABvtLZS8O67dLJXrAP50oZoPLUssiTyI60Kh5k_mHTf7K3iY29Liy`
- **Spreadsheet ID:** `1_76ypstNWKYZ7iV7CfwMsNGnP7dzdKaTyce2QlpaefI`
- Runtime: V8 | Timezone: `Asia/Bangkok`
- ถ้าจะ deploy ฝั่งนี้: `cd download/google-apps-script && clasp push` แล้ว Deploy เป็น Web app ใน Apps Script Editor
- เมื่อแก้ข้อมูลผ่าน GAS ต้องเรียก `CacheService.getScriptCache().remove('requests_v1')`

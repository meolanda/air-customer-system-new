# CLAUDE.md — ระบบรับงานบริการแอร์

## 🧭 ภาพรวมโปรเจกต์

ระบบบริหารจัดการงานบริการแอร์คอนดิชั่น สำหรับทีม 8 คน

**Stack:**
- Frontend/UI: **Next.js 15** + React 19 + TypeScript + Tailwind CSS (deploy บน Vercel)
- Backend: **Google Apps Script** (`.gs`) — จัดการ Spreadsheet, Drive, Calendar
- Database: Google Sheets
- File Storage: Google Drive
- AI: Gemini Vision API (วิเคราะห์รูปภาพ)

---

## 📁 โครงสร้างไฟล์

```
aircon-service-master/
├── src/
│   └── app/
│       └── page.tsx              ← Next.js UI หลัก (monolithic ~900 lines)
├── download/
│   └── google-apps-script/
│       ├── Code.gs               ← GAS Backend (CRUD, Auth, AI, Calendar)
│       ├── index.html            ← HTML shell (GAS Web App)
│       ├── css.html              ← Styles
│       ├── js.html               ← Frontend logic (Vanilla JS)
│       ├── appsscript.json       ← OAuth scopes + runtime config
│       └── .clasp.json           ← Clasp config (scriptId, filePushOrder)
├── features.json                 ← Feature tracking
└── CLAUDE.md                     ← (ไฟล์นี้)
```

---

## ⚙️ CONFIG หลัก (`Code.gs`)

```js
const CONFIG = {
  SHEET_NAME: 'งานบริการ',       // Sheet เก็บงาน
  USERS_SHEET: 'Users',          // Sheet ผู้ใช้
  TECHNICIANS_SHEET: 'ช่าง',     // Sheet ช่าง
  DRIVE_FOLDER_NAME: 'Aircon Service Images',
  CALENDAR_ID: 'c_fbb2...'       // Google Calendar สำหรับนัดหมาย
}
```

---

## 🔄 Status Workflow

```
new → queue → completed
new → waiting_quote → checking_parts → send_quote → waiting_response → new
                                                                     → cancelled
```

| Status | ความหมาย |
|--------|---------|
| `new` | รับเรื่องใหม่ |
| `queue` | จองคิว / นัดหมาย |
| `waiting_quote` | ขอใบเสนอราคา |
| `checking_parts` | เช็คอะไหล่ + เสนอราคา |
| `send_quote` | ส่งใบเสนอราคาแล้ว |
| `waiting_response` | รอลูกค้าตอบกลับ |
| `completed` | เสร็จสิ้น |
| `cancelled` | ยกเลิก |

---

## 🗄️ Data Schema (Google Sheets Headers)

```
id, requestNo, createdAt, channel, customerName,
phone, address, serviceType, description, priority,
status, appointmentDate, notes, imageUrl, pdfUrl, pdfFileName, history
```

- `requestNo` format: `REQ-YYYYMMDD-001`
- `history` เก็บเป็น JSON string: `[{status, date, by}]`
- `id` = `Date.now().toString()`
- `pdfUrl` = Google Drive view URL (`/file/d/{id}/view`)
- `pdfFileName` = ชื่อไฟล์ต้นฉบับ

---

## 🔌 Backend Functions (`Code.gs`)

| Function | หน้าที่ |
|----------|--------|
| `doGet(e)` | Serve HTML Web App |
| `getRequests()` | ดึงงานทั้งหมด (Cache 5 นาที) |
| `addRequest(data)` | เพิ่มงานใหม่ (ใช้ LockService) |
| `updateRequest(data)` | อัปเดตงาน (merge + history) |
| `updateStatus(id, status, byName)` | เปลี่ยน status พร้อม log |
| `deleteRequest(id)` | ลบงาน |
| `getUsers()` | ดึงรายชื่อผู้ใช้ |
| `getTechnicians()` | ดึงรายชื่อช่าง |
| `uploadImage(base64, name)` | อัปโหลดรูปไป Google Drive |
| `uploadFile(base64, name)` | อัปโหลดไฟล์ (PDF/DOC/XLS) ไป Google Drive |
| `analyzeImageWithAI(base64)` | วิเคราะห์รูปด้วย Gemini Vision |
| `setup()` | สร้าง Sheets + default data (รันครั้งแรก) |
| `logErrorToSheet(msg)` | Log error ไปที่ sheet "Debug Log" |

---

## 🚀 วิธี Deploy

### Next.js (Vercel)
```bash
git push origin main   # Vercel auto-deploy
```

### Google Apps Script
1. ```bash
   cd download/google-apps-script
   clasp push
   ```
2. Deploy ใน Apps Script Editor → Deploy → New deployment → Web app
   - Execute as: **Me** | Who has access: **Anyone**

---

## 🔑 Environment

### Next.js (`.env.local`)
| Key | ค่า |
|-----|-----|
| `NEXT_PUBLIC_GAS_URL` | GAS Web App URL |

### GAS Script Properties
| Key | ค่า |
|-----|-----|
| `GEMINI_API_KEY` | API Key สำหรับ Gemini Vision |

---

## ⚠️ ข้อควรระวัง

- **Cache:** ทุกครั้งที่แก้ข้อมูลต้องเรียก `CacheService.getScriptCache().remove('requests_v1')`
- **LockService:** `addRequest` ใช้ Script Lock 10 วินาที ป้องกัน race condition
- **File order:** `.clasp.json` กำหนด `filePushOrder` — ห้ามเปลี่ยนลำดับโดยไม่จำเป็น
- **HTML templates:** `index.html` ใช้ `<?!= include('css'); ?>` และ `<?!= include('js'); ?>`
- **Debug:** ดู error ได้ที่ sheet "Debug Log" ใน Spreadsheet
- **Package manager:** ใช้ `bun`

---

## 📱 Default Users

```
u1=คุณเนย, u2=คุณฟิล์ม, u3=คุณตุ้ม, u4=คุณดอย,
u5=คุณดอจ, u6=คุณออมสิน, u7=คุณเผือก
```

---

## 🔗 Links

- **Repository:** https://github.com/meolanda/air-customer-system-new
- **GAS Script ID:** `1craABvtLZS8O67dLJXrAP50oZoPLUssiTyI60Kh5k_mHTf7K3iY29Liy`
- **Spreadsheet ID:** `1_76ypstNWKYZ7iV7CfwMsNGnP7dzdKaTyce2QlpaefI`
- **Runtime:** V8 | Timezone: `Asia/Bangkok`

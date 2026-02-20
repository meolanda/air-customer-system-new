# Architecture Document
# โครงสร้างระบบรับงานบริการแอร์

---

## 📋 ข้อมูลเอกสาร

| รายการ | รายละเอียด |
|---------|------------|
| **ชื่อเอกสาร** | Architecture Document - ระบบรับงานบริการแอร์ |
| **เวอร์ชัน** | 1.0.0 |
| **วันที่สร้าง** | 20 กุมภาพันธ์ 2026 |
| **ผู้รับผิดชอบ** | Wichaya Sitthirit |
| **สถานะ** | Final |

---

## 🎯 ภาพรวมสถาปัตยกรรม (Architecture Overview)

### **แนวคิดหลัก:**
```
🎯 Serverless Architecture + Google Workspace
├── ไม่ต้องมี Server เอง
├── ใช้ Google Cloud Infrastructure
├── ฟรี 100%
└── ง่ายต่อการบำรุงรักษา
```

---

## 🏗️ โครงสร้างระบบ (System Architecture)

### **High-Level Architecture:**

```
┌─────────────────────────────────────────────────────────────┐
│                    USER LAYER (ผู้ใช้)                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  แอดมิน  │  │ฝ่ายใบเสนอ│  │ฝ่ายจัดซื้อ│  │  ลูกค้า   │   │
│  │   (6 คน)  │  │ ราคา (1)│  │  (1 คน)  │  │          │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│       │              │              │              │       │
│       └──────────────┴──────────────┴──────────────┘       │
│                          │                                 │
└──────────────────────────┼─────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  PRESENTATION LAYER                         │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Web App (Google Apps Script)               │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │  HTML + Tailwind CSS + JavaScript (Vanilla)    │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   APPLICATION LAYER                         │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Google Apps Script (Backend)                 │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │  • doGet() - Serve HTML                        │  │  │
│  │  │  • addRequest() - Create request              │  │  │
│  │  │  • updateRequest() - Update request            │  │  │
│  │  │  • deleteRequest() - Delete request            │  │  │
│  │  │  • getRequests() - Get all requests            │  │  │
│  │  │  • getUsers() - Get users                      │  │  │
│  │  │  • uploadImage() - Upload to Drive             │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
           ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────┐
│                    DATA LAYER                               │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Google Sheets│  │ Google Drive │  │    Cache     │     │
│  │              │  │              │  │              │     │
│  │ • งานบริการ   │  │ • รูปภาพ      │  │ • Temp data  │     │
│  │ • Users      │  │ • วิดีโอ     │  │ • Speed up   │     │
│  │ • อะไหล่     │  │ • เอกสาร     │  │              │     │
│  │              │  │              │  │              │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              EXTERNAL SERVICES (Future)                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Telegram   │  │   Gmail      │  │   Calendar   │     │
│  │     Bot      │  │   API        │  │     API      │     │
│  │              │  │              │  │              │     │
│  │ • แจ้งเตือน   │  │ • ส่งเมล     │  │ • ลงปฏิทิน   │     │
│  │              │  │              │  │              │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 โครงสร้างไฟล์ (File Structure)

### **Google Apps Script Project Structure:**

```
Apps Script Project/
├── Code.gs                    # Backend logic
│   ├── CONFIG                # การตั้งค่า
│   ├── Web App Endpoints     # เสิร์ฟ HTML
│   ├── Data Operations       # CRUD operations
│   ├── User Management       # จัดการผู้ใช้
│   ├── Image Upload          # อัปโหลดรูป
│   └── Helper Functions      # ฟังก์ชันช่วยเหลือ
│
├── index.html                # Main HTML page
├── css.html                  # CSS styles (fallback)
└── js.html                   # JavaScript (frontend logic)
```

### **Google Sheets Structure:**

```
Google Sheets: "ระบบรับงานบริการแอร์"
│
├── Sheet: "งานบริการ" (Main Data)
│   └── Columns:
│       A:  id                   # Unique ID
│       B:  requestNo            # เลขที่เอกสาร
│       C:  createdAt            # วันที่สร้าง
│       D:  channel              # ช่องทางติดต่อ
│       E:  customerName         # ชื่อลูกค้า
│       F:  phone                # เบอร์โทร
│       G:  address              # ที่อยู่
│       H:  serviceType          # ประเภทงาน
│       I:  description          # รายละเอียด
│       J:  priority             # ความเร่งด่วน
│       K:  status               # สถานะ
│       L:  appointmentDate      # วันนัด
│       M:  notes                # หมายเหตุ
│       N:  imageUrl             # URL รูปภาพ
│       O:  history              # ประวัติการเปลี่ยนสถานะ (JSON)
│
├── Sheet: "Users" (User Management)
│   └── Columns:
│       A:  id                   # User ID
│       B:  name                 # ชื่อผู้ใช้
│       C:  department           # ฝ่าย
│
└── Sheet: "อะไหล่" (Parts Inventory - Future)
    └── Columns:
        A:  ชื่ออะไหล่
        B:  ราคา
        C:  Stock
        D:  Supplier
```

### **Google Drive Structure:**

```
Google Drive: "Aircon Service Images"/
├── รูปภาพงาน/
│   ├── REQ-20260220-001.jpg
│   ├── REQ-20260220-002.jpg
│   └── ...
├── วิดีโอ/
│   ├── REQ-20260220-003.mp4
│   └── ...
└── เอกสาร/
    ├── Quotation_REQ-20260220-004.pdf
    └── ...
```

---

## 🔄 Data Flow (การไหลของข้อมูล)

### **1. การสร้างงานใหม่ (Create Request):**

```
USER (ฝ่ายแอดมิน)
    │
    ├─→ กรอกข้อมูลใน Web App
    │   ├─→ ชื่อลูกค้า
    │   ├─→ เบอร์โทร
    │   ├─→ ที่อยู่
    │   ├─→ ประเภทงาน
    │   ├─→ รายละเอียด
    │   ├─→ ความเร่งด่วน
    │   └─→ อัปโหลดรูป (ถ้ามี)
    │
    ▼
FRONTEND (JavaScript)
    │
    ├─→ Validate input
    ├─→ แปลงรูปเป็น Base64
    └─→ ส่งไป Backend
    │
    ▼
BACKEND (Google Apps Script)
    │
    ├─→ Generate ID (Timestamp)
    ├─→ Generate Request No (REQ-YYYYMMDD-###)
    ├─→ สร้าง History เริ่มต้น
    ├─→ เพิ่ม Row ใน Google Sheets
    ├─→ Upload รูปไป Google Drive
    └─→ Return success
    │
    ▼
DATABASE (Google Sheets)
    │
    └─→ Store data
    │
    ▼
USER
    └─→ เห็นงานใหม่ในรายการ
```

---

### **2. การเปลี่ยนสถานะ (Update Status):**

```
USER (ฝ่ายใดฝ่ายหนึ่ง)
    │
    ├─→ เลือกงาน
    ├─→ กดปุ่มเปลี่ยนสถานะ
    └─→ เลือกสถานะใหม่
    │
    ▼
FRONTEND (JavaScript)
    │
    ├─→ ตรวจสอบสิทธิ์ (มีสิทธิ์กดไหม)
    ├─→ แสดง Confirmation Dialog
    └─→ ส่งไป Backend
    │
    ▼
BACKEND (Google Apps Script)
    │
    ├─→ ตรวจสอบว่ามีงานนี้ไหม
    ├─→ เปรียบเทียบสถานะเก่ากับใหม่
    ├─→ ถ้าต่างกัน:
    │   ├─→ เพิ่ม History entry
    │   ├─→ อัปเดตสถานะใน Google Sheets
    │   └─→ Clear cache
    └─→ Return success
    │
    ▼
DATABASE (Google Sheets)
    │
    └─→ Update status & history
    │
    ▼
USER (ทุกคน)
    └─→ เห็นสถานะใหม่ (Real-time)
```

---

### **3. การดูรายการงาน (View Requests):**

```
USER (ฝ่ายใดฝ่ายหนึ่ง)
    │
    └─→ เปิด Web App
    │
    ▼
FRONTEND (JavaScript)
    │
    ├─→ Call google.script.run.getRequests()
    │
    ▼
BACKEND (Google Apps Script)
    │
    ├─→ Check cache (ถ้ามี)
    ├─→ ถ้าไม่มี:
    │   ├─→ Read all rows from Google Sheets
    │   ├─→ Convert to objects
    │   └─→ Store cache (5 นาที)
    └─→ Return data
    │
    ▼
FRONTEND
    │
    ├─→ Render list
    ├─→ แสดงสถานะด้วยสี
    ├─→ แสดงประวัติ (ถ้ามี)
    └─→ แสดงรูป (ถ้ามี)
    │
    ▼
USER
    └─→ เห็นรายการงาน
```

---

## 🔐 Security Architecture (สถาปัตยกรรมความปลอดภัย)

### **1. Authentication:**

```
┌─────────────────────────────────────────────┐
│        Authentication Flow                 │
├─────────────────────────────────────────────┤
│                                             │
│  1. User เปิด Web App                      │
│     ↓                                       │
│  2. Frontend check localStorage             │
│     ↓                                       │
│  3. ถ้ามี currentUser → เข้าสู่ระบบ      │
│     ถ้าไม่มี → แสดงหน้า Login            │
│     ↓                                       │
│  4. User เลือกตัวเอง (8 คน)               │
│     ↓                                       │
│  5. Save currentUser to localStorage        │
│     ↓                                       │
│  6. เข้าสู่ระบบ                           │
│                                             │
└─────────────────────────────────────────────┘
```

### **2. Authorization (สิทธิ์การเข้าถึง):**

| ฝ่าย | ทำอะไรได้ |
|------|---------|
| **admin** | • สร้างงาน<br>• แก้ไขงาน<br>• เปลี่ยนสถานะทุกอย่าง<br>• ลบงาน |
| **quotation** | • แก้ไขงาน<br>• เปลี่ยนสถานะ |
| **procurement** | • แก้ไขงาน<br>• เปลี่ยนสถานะ |

**หมายเหตุ:** ทุกฝ่ายเห็นงานทั้งหมด (ไม่กรองตามฝ่าย)

### **3. Data Protection:**

```
┌─────────────────────────────────────────────┐
│         Data Protection Measures           │
├─────────────────────────────────────────────┤
│                                             │
│  • Google Sheets Permission                │
│    - แชร์เฉพาะคนในทีม                    │
│    - ใช้ Service Account                   │
│                                             │
│  • Google Drive Permission                 │
│    - Folder สำหรับรูปภาพ                  │
│    - Anyone with link can view             │
│                                             │
│  • Web App Deployment                      │
│    - Execute as: Me (Owner)                │
│    - Who has access: Anyone                │
│                                             │
│  • Client-side Validation                  │
│    - Validate input before send            │
│    - XSS Prevention                        │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 🎨 UI/UX Architecture

### **Component Structure:**

```
App
├── LoginScreen
│   ├── UserSelection (8 users)
│   └── DepartmentBadge
│
└── MainApp
    ├── Header
    │   ├── Logo
    │   ├── UserInfo
    │   ├── StorageIndicator (Google/Local)
    │   └── LogoutButton
    │
    ├── DashboardStats
    │   ├── TotalRequests
    │   ├── PendingRequests
    │   └── CompletedRequests
    │
    ├── SearchBar
    │   ├── SearchInput
    │   ├── StatusFilter
    │   └── RefreshButton
    │
    ├── RequestList
    │   └── RequestCard (Array)
    │       ├── RequestInfo
    │       ├── CustomerInfo
    │       ├── ImagePreview
    │       ├── StatusBadge
    │       ├── ActionButtons
    │       └── HistoryTimeline
    │
    ├── RequestModal
    │   ├── ChannelSelector
    │   ├── CustomerForm
    │   ├── ServiceDetails
    │   ├── PrioritySelector
    │   ├── ImageUpload
    │   ├── StatusSelector
    │   └── NotesInput
    │
    └── ToasterNotification
        └── Toast (Alert)
```

### **State Management:**

```javascript
// Frontend State
const state = {
  currentUser: User | null,        // ผู้ใช้ที่ล็อกอิน
  requests: Request[],             // รายการงานทั้งหมด
  isGoogleConfigured: boolean,     // ใช้ Google Sheets หรือไม่
  isLoading: boolean,              // กำลังโหลด
  isSaving: boolean,               // กำลังบันทึก
  uploadProgress: number | null,   // Progress การอัปโหลด
  searchTerm: string,              // คำค้นหา
  statusFilter: string,            // กรองตามสถานะ
  isModalOpen: boolean,            // Modal เปิด/ปิด
  editingRequest: Request | null   // งานที่กำลังแก้ไข
}

// Local Storage Keys
const localStorageKeys = {
  currentUser: 'currentUser',           // User ที่ล็อกอิน
  serviceRequests: 'serviceRequests'    // Fallback data
}
```

---

## ⚡ Performance Optimization

### **1. Caching Strategy:**

```javascript
// Google Apps Script Cache
const CACHE_KEY = 'requests';
const CACHE_DURATION = 300; // 5 นาที

function getRequests() {
  // เช็ค cache ก่อน
  const cached = CacheService.getScriptCache().get(CACHE_KEY);
  if (cached) {
    return JSON.parse(cached);
  }

  // ถ้าไม่มี cache ให้ query Google Sheets
  const data = fetchFromSheets();

  // เก็บใน cache
  CacheService.getScriptCache().put(CACHE_KEY, JSON.stringify(data), CACHE_DURATION);

  return data;
}

function clearCache() {
  CacheService.getScriptCache().remove(CACHE_KEY);
}
```

### **2. Lazy Loading:**

```javascript
// Frontend: Load images on demand
const lazyLoadImage = (url) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(url);
    img.onerror = () => resolve(null);
    img.src = url;
  });
};
```

### **3. Debouncing:**

```javascript
// Frontend: Debounce search
const debounce = (func, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
};
```

---

## 🔄 Error Handling Architecture

### **Error Types:**

```javascript
const ErrorTypes = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  AUTH_ERROR: 'AUTH_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND_ERROR: 'NOT_FOUND_ERROR',
  PERMISSION_ERROR: 'PERMISSION_ERROR',
  GOOGLE_SCRIPT_ERROR: 'GOOGLE_SCRIPT_ERROR'
};
```

### **Error Handling Flow:**

```
User Action
    ↓
Try Execute
    ↓
Error?
    ├─→ No → Success
    │
    └─→ Yes → Log Error
              ↓
              Show User Message
              ↓
              Offer Retry / Solution
```

### **Example Error Handling:**

```javascript
// Frontend
try {
  const result = await google.script.run
    .withSuccessHandler(onSuccess)
    .withFailureHandler((error) => {
      console.error('Google Script Error:', error);
      showToast('เกิดข้อผิดพลาด กรุณาลองใหม่', 'error');
    })
    .addRequest(request);
} catch (error) {
  console.error('Client Error:', error);
  showToast('เกิดข้อผิดพลาด กรุณาลองใหม่', 'error');
}

// Backend
function addRequest(request) {
  try {
    // Business logic
    const result = doSomething();
    return { success: true, data: result };
  } catch (error) {
    console.error('addRequest Error:', error);
    return { success: false, error: error.toString() };
  }
}
```

---

## 📊 Monitoring & Logging

### **Logging Strategy:**

```javascript
// Frontend Logging
const log = {
  info: (msg, data) => console.log(`[INFO] ${msg}`, data),
  warn: (msg, data) => console.warn(`[WARN] ${msg}`, data),
  error: (msg, data) => console.error(`[ERROR] ${msg}`, data)
};

// Backend Logging (Google Apps Script)
function logError(functionName, error) {
  console.error(`[${functionName}] Error:`, error);
  // Optional: Send to monitoring service
}
```

### **Metrics to Track:**

| Metric | Description | Target |
|--------|-------------|--------|
| **Response Time** | เวลาตอบสนอง | < 3s |
| **Error Rate** | อัตราข้อผิดพลาด | < 1% |
| **User Activity** | กิจกรรมผู้ใช้ | Track daily |
| **Storage Usage** | การใช้พื้นที่ | Monitor weekly |

---

## 🚀 Deployment Architecture

### **Deployment Process:**

```
1. Development (Local)
    ↓
2. Google Apps Script Editor
    ├─→ Paste Code.gs
    ├─→ Create index.html
    ├─→ Create css.html
    └─→ Create js.html
    ↓
3. Run Setup
    ├─→ Create Sheets
    ├─→ Create Folders
    └─→ Initialize Data
    ↓
4. Deploy as Web App
    ├─→ Version: New
    ├─→ Execute as: Me
    └─→ Who has access: Anyone
    ↓
5. Test URL
    ↓
6. Share URL to Team
```

### **Version Control:**

```javascript
// Version in Code.gs
const VERSION = '1.0.0';

// Changelog:
const CHANGELOG = {
  '1.0.0': 'Initial release',
  '1.1.0': 'Add Telegram notification',
  '1.2.0': 'Add calendar integration'
};
```

---

## 🔄 Backup & Recovery Strategy

### **Automatic Backups:**

```
Google Sheets (Built-in)
├── Version History (Keep forever)
├── 30-day version storage
└── Restore any version

Google Drive (Built-in)
├── File versioning
├── Trash bin (30 days)
└── Download backups
```

### **Manual Backup:**

```javascript
// Backup function
function backupData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();

  // Create backup spreadsheet
  const backup = SpreadsheetApp.create(`Backup_${new Date().toISOString()}`);

  sheets.forEach(sheet => {
    const data = sheet.getDataRange().getValues();
    const backupSheet = backup.insertSheet(sheet.getName());
    backupSheet.getRange(1, 1, data.length, data[0].length).setValues(data);
  });

  return backup.getUrl();
}
```

---

## 🎯 Future Enhancements

### **Phase 2: Advanced Features**

```
┌─────────────────────────────────────────────┐
│         Future Architecture                 │
├─────────────────────────────────────────────┤
│                                             │
│  ┌──────────────┐                           │
│  │ Telegram Bot │ ← Real-time notifications │
│  └──────────────┘                           │
│                                             │
│  ┌──────────────┐                           │
│  │   Gmail API  │ ← Email notifications     │
│  └──────────────┘                           │
│                                             │
│  ┌──────────────┐                           │
│  │ Calendar API │ ← Auto-schedule           │
│  └──────────────┘                           │
│                                             │
│  ┌──────────────┐                           │
│  │   Reports    │ ← Analytics               │
│  └──────────────┘                           │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 📚 References

### **Documentation:**
- [Google Apps Script Documentation](https://developers.google.com/apps-script)
- [Google Sheets API](https://developers.google.com/sheets/api)
- [Google Drive API](https://developers.google.com/drive/api)

### **Best Practices:**
- JavaScript Best Practices
- Google Apps Script Performance Tips
- Security Best Practices

---

## ✅ Architecture Checklist

- [x] ✅ Define system architecture
- [x] ✅ Define data structure
- [x] ✅ Define security model
- [x] ✅ Define performance strategy
- [x] ✅ Define error handling
- [x] ✅ Define deployment process
- [x] ✅ Define backup strategy

---

**เอกสารนี้เป็นฉบับสมบูรณ์ (Final)**

**วันที่อัปเดตล่าสุด:** 20 กุมภาพันธ์ 2026

**ผู้อัปเดต:** Wichaya Sitthirit

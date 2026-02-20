# ❄️ ระบบรับงานบริการแอร์

ระบบรวบรวมข้อมูลลูกค้าจากหลายช่องทาง (LINE/โทร/Walk-in/Facebook) พร้อมระบบติดตามสถานะงาน

## 👥 โครงสร้างทีม

| ฝ่าย | จำนวน | หน้าที่ |
|------|-------|---------|
| ฝ่ายแอดมิน | 6 คน | รับเรื่อง, ขอคิว, ลงปฏิทิน, ดูแลลูกค้า |
| ฝ่ายทำใบเสนอราคา | 1 คน | ทำใบเสนอราคา |
| ฝ่ายจัดซื้อ | 1 คน | เช็คอะไหล่ |

## 🔄 Workflow

```
ลูกค้าแจ้งงาน → คีย์เข้าระบบ → เลือกสถานะ:
├── 📋 ขอคิว → ฝ่ายแอดมิน → ลงปฏิทินคิวช่าง
├── 💰 ขอใบเสนอราคา → ฝ่ายทำใบเสนอราคา → ส่งแอดมิน → ส่งลูกค้า
└── 🔧 เช็คอะไหล่เสนอราคา → ฝ่ายจัดซื้อ → ฝ่ายทำใบเสนอราคา → ส่งแอดมิน → ส่งลูกค้า
```

## 🚀 การติดตั้ง

```bash
# Install dependencies
bun install

# Run development server
bun run dev
```

เปิด [http://localhost:3000](http://localhost:3000)

## 📦 การเชื่อม Google Sheets + Drive

ดูรายละเอียดใน `download/SETUP_GUIDE.md`

### Environment Variables

สร้างไฟล์ `.env.local`:

```env
GOOGLE_SERVICE_ACCOUNT_EMAIL=xxx@xxx.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEETS_ID=your_spreadsheet_id
GOOGLE_DRIVE_FOLDER_ID=your_folder_id
```

## 🛠️ Tech Stack

- **Frontend**: Next.js 15, React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: Google Sheets / localStorage (fallback)
- **Storage**: Google Drive (รูปภาพ)
- **Auth**: Service Account (Google Cloud)

## 📁 โครงสร้างโปรเจกต์

```
src/
├── app/
│   ├── page.tsx          # Main UI
│   ├── layout.tsx        # Layout
│   ├── globals.css       # Styles
│   └── api/
│       ├── sheets/route.ts   # Google Sheets API
│       └── upload/route.ts   # Google Drive Upload API
```

## 📄 License

MIT

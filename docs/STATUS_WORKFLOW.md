# 🔄 Status Workflow System

## 📋 ภาพรวม

ระบบสถานะที่ **ติดตัว** กับงาน เคลื่อนทีละ step ตาม workflow จริง ไม่กระโดด ไม่งงๆ

---

## 🎯 หลักการสำคัญ

### 1. **1 Request = 1 เส้นทางชัดเจน**
- เลือกเส้นทางตอนสร้าง (คิว, ใบเสนอราคา, หรือเช็คอะไหล่)
- ไปตามเส้นนั้นจนจบ
- เปลี่ยนเส้นทางได้ตลอดเวลา

### 2. **เคลื่อนทีละ step**
- ไม่กระโดดสถานะ
- แต่ละสถานะมี **ปุ่มถัดไปเดียว** (หรือเลือกเส้นทางถ้าเป็นจุดแยก)

### 3. **ย้อนกลับได้**
- กดย้อนกลับไปสถานะก่อนหน้าได้
- เปลี่ยนเส้นทางได้ (เช่นจองคิว → ขอใบเสนอราคา)

### 4. **ยกเลิกได้ทุกสถานะ**
- ไม่ต้องรอถึงจุดไหน
- ยกเลิกทันที

---

## 🗺️ Workflow Diagram

```
เส้นทางที่ 1: คิวงาน (Queue Path)     เส้นทางที่ 2: ใบเสนอราคา (Quote Path)    เส้นทางที่ 3: เช็คอะไหล่ (Parts Path)

📥 รับเรื่องใหม่                     📥 รับเรื่องใหม่                     📥 รับเรื่องใหม่
    ↓ [เลือกคิว]                         ↓ [เลือกใบเสนอราคา]                 ↓ [เลือกเช็คอะไหล่]
📋 จองคิว/นัดหมาย                    💰 ขอใบเสนอราคา                    🔧 เช็คอะไหล่+เสนอราคา
    ↓                                       ↓                                       ↓
📤 รอส่งลูกค้า                    🔧 เช็คอะไหล่+เสนอราคา           📨 ส่งใบเสนอราคาแล้ว
    ↓                                       ↓                                       ↓
✅ ส่งลูกค้าแล้ว                    📨 ส่งใบเสนอราคาแล้ว           ⏳ รอลูกค้าตอบกลับ
    ↓                                       ↓                                       ↓
🏁 เสร็จสิ้น                         ⏳ รอลูกค้าตอบกลับ              📤 รอส่งลูกค้า
                                          ↓                                       ↓
                                          📤 รอส่งลูกค้า                    ✅ ส่งลูกค้าแล้ว
                                          ↓                                       ↓
                                          ✅ ส่งลูกค้าแล้ว                    🏁 เสร็จสิ้น
                                          ↓
                                          🏁 เสร็จสิ้น

ทุกจุด ───→ ❌ ยกเลิก
```

---

## 📊 สถานะทั้งหมด (10 สถานะ)

| Status | Label | Icon | เส้นทาง | คำอธิบาย |
|--------|-------|------|----------|-----------|
| `new` | รับเรื่องใหม่ | 📥 | both | งานใหม่เข้ามา |
| `queue` | จองคิว/นัดหมาย | 📋 | queue | นัดวัน/เวลาทำงาน |
| `waiting_quote` | ขอใบเสนอราคา | 💰 | quote | ลูกค้าต้องการใบเสนอราคา |
| `checking_parts` | เช็คอะไหล่+เสนอราคา | 🔧 | quote | ตรวจอะไหล่และคำนวณราคา |
| `send_quote` | ส่งใบเสนอราคาแล้ว | 📨 | quote | ฝ่ายแอดมินส่งใบเสนอราคาแล้ว |
| `waiting_response` | รอลูกค้าตอบกลับ | ⏳ | quote | รอลูกค้าตอบรับใบเสนอราคา |
| `waiting_send` | รอส่งลูกค้า | 📤 | both | เสร็จแล้ว รอส่ง |
| `sent` | ส่งลูกค้าแล้ว | ✅ | both | ส่งมอบแล้ว |
| `completed` | เสร็จสิ้น | 🏁 | terminal | งานเสร็จสมบูรณ์ |
| `cancelled` | ยกเลิก | ❌ | terminal | ลูกค้ายกเลิก |

---

## 🔄 การเปลี่ยนสถานะ (State Transitions)

### จาก "รับเรื่องใหม่"
```
new ──→ queue           (คิวงาน)
new ──→ waiting_quote   (ขอใบเสนอราคา)
new ──→ checking_parts  (เช็คอะไหล่ทันที)
new ──→ cancelled       (ยกเลิก)
```

### จาก "จองคิว/นัดหมาย"
```
queue ──→ waiting_send   (นัดแล้ว → ส่งลูกค้า)
queue ──→ cancelled      (ยกเลิก)
queue ←── new            (ย้อนกลับ)
queue ←── waiting_quote  (เปลี่ยยมาจากใบเสนอราคา)
queue ←── checking_parts (เปลี่ยยมาจากเช็คอะไหล่)
queue ←── waiting_response (เปลี่ยยมาจากรอลูกค้าตอบ)
```

### จาก "ขอใบเสนอราคา"
```
waiting_quote ──→ checking_parts  (ดูอะไหล่ + เสนอราคา)
waiting_quote ──→ queue           (เปลี่ยยเป็นคิวงาน)
waiting_quote ──→ cancelled       (ยกเลิก)
waiting_quote ←── new            (ย้อนกลับ)
```

### จาก "เช็คอะไหล่+เสนอราคา"
```
checking_parts ──→ send_quote        (ส่งใบเสนอราคาแล้ว)
checking_parts ──→ waiting_send      (ไม่ต้องส่งใบเสนอราคา → ส่งลูกค้า)
checking_parts ──→ queue             (เปลี่ยยเป็นคิวงาน)
checking_parts ──→ cancelled         (ยกเลิก)
checking_parts ←── new              (เริ่มจากใหม่)
checking_parts ←── waiting_quote    (ย้อนกลับ)
checking_parts ←── waiting_response (ลูกค้ายังไม่ตกลง → เช็คใหม่)
```

### จาก "ส่งใบเสนอราคาแล้ว"
```
send_quote ──→ waiting_response  (รอลูกค้าตอบกลับ)
send_quote ──→ cancelled          (ยกเลิก)
send_quote ←── checking_parts    (ย้อนกลับ)
```

### จาก "รอลูกค้าตอบกลับ"
```
waiting_response ──→ waiting_send    (ลูกค้าตอบตกลง → ส่งลูกค้า)
waiting_response ──→ checking_parts  (ลูกค้ายังไม่ตกลง → เช็คใหม่)
waiting_response ──→ queue           (เปลี่ยยเป็นคิวงาน)
waiting_response ──→ cancelled       (ยกเลิก)
waiting_response ←── send_quote     (ย้อนกลับ)
```

### จาก "รอส่งลูกค้า"
```
waiting_send ──→ sent              (ส่งลูกค้าแล้ว)
waiting_send ──→ completed         (เสร็จเลย)
waiting_send ──→ cancelled         (ยกเลิก)
waiting_send ←── queue             (ย้อนกลับจากคิว)
waiting_send ←── checking_parts    (ย้อนกลับจากเช็คอะไหล่)
waiting_send ←── waiting_response  (ย้อนกลับจากรอลูกค้าตอบ)
```

### จาก "ส่งลูกค้าแล้ว"
```
sent ──→ completed              (เสร็จสิ้น)
sent ──→ cancelled              (ยกเลิก)
sent ←── waiting_send           (ย้อนกลับ)
```

---

## 💻 การใช้งานใน Code

```typescript
import {
  getStatusConfig,
  getNextStatuses,
  canTransitionTo,
  formatStatusLabel,
} from '@/lib/STATUS_WORKFLOW';

// ดึง config ของสถานะ
const config = getStatusConfig('new');
console.log(config.label); // "รับเรื่องใหม่"
console.log(config.nextStatuses); // ["queue", "waiting_quote", "cancelled"]

// เช็คว่าเปลี่ยนสถานะได้ไหม
if (canTransitionTo('new', 'queue')) {
  // เปลี่ยนได้!
}

// แสดง label สวยๆ
const label = formatStatusLabel('queue'); // "📋 จองคิว / นัดหมาย"
```

---

## 🎨 UI Components

### Request Card
```
┌─────────────────────────────────────┐
│ 📥 รับเรื่องใหม่                   │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                      │
│ สมชาย | 0855633964                 │
│ ล้างแอร์ 2 ตัว - เมกาบางนา    │
│                                      │
│ [คิวงาน]  [ขอใบเสนอราคา]       │
└─────────────────────────────────────┘
```

### Status Progress
```
[████████████░░░░░░░] 60%
📥 → 📋 → 📤 → ✅ → 🏁
        อยู่ตรงนี้ ↑
```

---

## 📝 Required Fields per Status

| Status | Required Fields |
|--------|----------------|
| `new` | - |
| `queue` | `appointmentDate` |
| `waiting_quote` | - |
| `checking_parts` | `quoteAmount` |
| `send_quote` | - |
| `waiting_response` | - |
| `waiting_send` | - |
| `sent` | - |
| `completed` | - |
| `cancelled` | `cancelReason` |

---

## 🚀 Next Steps

1. ✅ สร้าง Status Workflow Config
2. ⏳ สร้าง UI Components
3. ⏳ เชื่อมต่อกับ Google Apps Script
4. ⏳ เพิ่ม Status History tracking
5. ⏳ ทดสอบ end-to-end

---

**เอกสารนี้เขียนเมื่อ:** 2026-02-23
**เวอร์ชัน:** 1.0.0

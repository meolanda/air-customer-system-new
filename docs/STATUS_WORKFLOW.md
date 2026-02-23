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
    ↓ [ลงปฏิทิน]                           ↓ [ทำใบเสนอราคา]                   ↓ [เช็คราคาอะไหล่ + ทำใบเสนอ]
🏁 เสร็จสิ้น                         📨 ส่งใบเสนอราคาแล้ว           📨 ส่งใบเสนอราคาแล้ว
                                          ↓ [แอดมินส่งให้ลูกค้า]                ↓ [แอดมินส่งให้ลูกค้า]
                                          ⏳ รอลูกค้าตอบกลับ              ⏳ รอลูกค้าตอบกลับ
                                          ↓                                   ↓
                                          [อนุมัติ] → 📥 รับเรื่องใหม่       [อนุมัติ] → 📥 รับเรื่องใหม่
                                          [ไม่อนุมัติ] → ❌ ยกเลิก          [ไม่อนุมัติ] → ❌ ยกเลิก

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
new ──→ queue           (คิวงาน - ลูกค้าขอคิวทำงาน)
new ──→ waiting_quote   (ใบเสนอราคา - ราคาชัดเจนอยู่แล้ว)
new ──→ checking_parts  (เช็คอะไหล่ - ต้องเช็คราคาก่อน)
new ──→ cancelled       (ยกเลิก)
```

### จาก "จองคิว/นัดหมาย"
```
queue ──→ completed      (ลงปฏิทินแล้ว + ส่งช่างแล้ว → เสร็จสิ้น)
queue ──→ cancelled      (ยกเลิก)
queue ←── new            (ย้อนกลับ)
```

### จาก "ขอใบเสนอราคา"
```
waiting_quote ──→ send_quote        (ทำใบเสนอราคาเสร็จแล้ว)
waiting_quote ──→ cancelled         (ยกเลิก)
waiting_quote ←── new              (ย้อนกลับ)
```

### จาก "เช็คอะไหล่+เสนอราคา"
```
checking_parts ──→ send_quote        (เช็คราคาเสร็จ + ทำใบเสนอราคาเสร็จแล้ว)
checking_parts ──→ cancelled         (ยกเลิก)
checking_parts ←── new              (เริ่มจากใหม่)
checking_parts ←── waiting_response (ลูกค้าไม่อนุมัติ → เช็คใหม่)
```

### จาก "ส่งใบเสนอราคาแล้ว"
```
send_quote ──→ waiting_response  (รอลูกค้าอนุมัติ)
send_quote ──→ cancelled          (ยกเลิก)
send_quote ←── waiting_quote     (ย้อนกลับ - จากเส้นทาง 2)
send_quote ←── checking_parts    (ย้อนกลับ - จากเส้นทาง 3)
```

### จาก "รอลูกค้าตอบกลับ"
```
waiting_response ──→ new           (ลูกค้าอนุมัติ → เริ่มงานใหม่)
waiting_response ──→ checking_parts (ลูกค้าไม่อนุมัติ → เช็คใหม่)
waiting_response ──→ cancelled       (ลูกค้ายกเลิก)
waiting_response ←── send_quote     (ย้อนกลับ)
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

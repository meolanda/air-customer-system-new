# 🚀 Parallel Tasks - 5 Worktrees ทำงานพร้อมกัน

## 📋 Worktree Layout

```
aircon-service-master/
├── aircon-service-master/              [master] ✅ เสร็จแล้ว
├── aircon-service-feature-2-add-button/ [feature/add-request-button] 🔄 ทำอยู่
├── aircon-service-feature-3-timeline/   [feature/status-timeline] ⏳ รอเริ่ม
├── aircon-service-feature-4-quick-actions/ [feature/quick-actions] ⏳ รอเริ่ม
└── aircon-service-feature-5-export/      [feature/export-data] ⏳ รอเริ่ม
```

---

## 🎯 Feature ที่ 1: ✅ เสร็จแล้ว

### **แก้ไขฟอร์มสร้างงาน**
- ✅ ซ่อน Dropdown "สถานะ" เมื่อสร้างงานใหม่
- ✅ บังคับให้ `status = 'new'` เสมอ
- ✅ แสดง Dropdown เฉพาะตอนแก้ไขงาน
- ✅ Deploy แล้ว

**Branch:** `master`
**Status:** ✅ เสร็จสมบูรณ์

---

## 🎯 Feature ที่ 2: Add Request Button (ปุ่มสร้างงานที่โดดเด่น)

### **รายละเอียด:**
- เพิ่มปุ่ม "สร้างงานใหม่" ที่โดดเด่น
- ใช้สีสันสดใส (gradient หรือ animation)
- วางไว้ตรงกลางหรือมุมขวาบน
- เพิ่มไอคอน emoji ที่ชัดเจน
- เพิ่ม hover effect

### **ไฟล์ที่ต้องแก้:**
- `download/google-apps-script/js.html` - แก้ UI ปุ่มสร้างงาน

### **Branch:** `feature/add-request-button`
**Worktree:** `aircon-service-feature-2-add-button/`

---

## 🎯 Feature ที่ 3: Status Timeline (Timeline การเปลี่ยนสถานะ)

### **รายละเอียด:**
- แสดง Timeline แนวนอนหรือแนวนอน
- แสดงประวัติการเปลี่ยนสถานะ
- ใช้สีและไอคอนให้เข้าใจง่าย
- แสดงเวลาที่เปลี่ยนแต่ละครั้ง
- Animation เมื่อมีการเปลี่ยนสถานะ

### **ไฟล์ที่ต้องแก้:**
- `download/google-apps-script/js.html` - เพิ่ม Timeline UI
- `download/google-apps-script/css.html` - เพิ่ม CSS animation

### **Branch:** `feature/status-timeline`
**Worktree:** `aircon-service-feature-3-timeline/`

---

## 🎯 Feature ที่ 4: Quick Actions (ปุ่มดำเนินการด่วน)

### **รายละเอียด:**
- เพิ่มปุ่ม "ย้ายงาน" (เปลี่ยนลูกค้า)
- เพิ่มปุ่ม "คัดลอกงาน"
- เพิ่มปุ่ม "ทำเครื่องหมาย"
- วางไว้บน card แต่ละงาน
- ใช้ icon + tooltip

### **ไฟล์ที่ต้องแก้:**
- `download/google-apps-script/js.html` - เพิ่ม Quick Action buttons
- `download/google-apps-script/Code.gs` - เพิ่มฟังก์ชัน backend (ถ้าจำเป็น)

### **Branch:** `feature/quick-actions`
**Worktree:** `aircon-service-feature-4-quick-actions/`

---

## 🎯 Feature ที่ 5: Export Data (ส่งออกข้อมูล)

### **รายละเอียด:**
- ส่งออกข้อมูลเป็น Excel/CSV
- กรองตามวันที่
- เลือกฟิลด์ที่ต้องการ
- ใช้ SheetJS (xlsx library)
- ดาวน์โหลดไฟล์โดยตรง

### **ไฟล์ที่ต้องแก้:**
- `download/google-apps-script/js.html` - เพิ่ม Export UI
- `download/google-apps-script/Code.gs` - เพิ่มฟังก์ชัน export
- `download/google-apps-script/index.html` - เพิ่ม SheetJS library

### **Branch:** `feature/export-data`
**Worktree:** `aircon-service-feature-5-export/`

---

## 🚀 วิธีรัน Parallel Agents

### **Option 1: รันทีละคน**

```bash
# Agent 1 - Feature 2 (Add Request Button)
cd aircon-service-feature-2-add-button
# แก้ไฟล์ js.html เพิ่มปุ่มสร้างงาน

# Agent 2 - Feature 3 (Status Timeline)
cd aircon-service-feature-3-timeline
# แก้ไฟล์ js.html เพิ่ม Timeline

# Agent 3 - Feature 4 (Quick Actions)
cd aircon-service-feature-4-quick-actions
# แก้ไฟล์ js.html เพิ่ม Quick Actions

# Agent 4 - Feature 5 (Export Data)
cd aircon-service-feature-5-export
# แก้ไฟล์ Code.gs เพิ่ม export function
```

### **Option 2: รันพร้อมกันด้วย Task tool**

ให้ฉันรัน parallel agents พร้อมกัน 4 ตัว!

---

## 📊 สรุป

| Feature | Worktree | Branch | สถานะ | Agent |
|---------|----------|--------|--------|-------|
| 1. Form Status Fix | master | master | ✅ เสร็จ | - |
| 2. Add Request Button | feature-2 | feature/add-request-button | 🔄 รอเริ่ม | Agent 1 |
| 3. Status Timeline | feature-3 | feature/status-timeline | ⏳ รอเริ่ม | Agent 2 |
| 4. Quick Actions | feature-4 | feature/quick-actions | ⏳ รอเริ่ม | Agent 3 |
| 5. Export Data | feature-5 | feature/export-data | ⏳ รอเริ่ม | Agent 4 |

---

## 🎯 ขั้นตอนต่อไป

**คุณต้องการให้:**
1. รัน Parallel Agents 4 ตัวพร้อมกันเลย?
2. หรือทำทีละฟีเจอร์?

**บอกผมได้เลยครับว่าต้องการแบบไหน!** 🚀

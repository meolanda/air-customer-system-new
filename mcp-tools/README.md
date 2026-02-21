# 🧹 Context Manager MCP

MCP Tool สำหรับแก้ปัญหา **Context บวม** - ลบ system reminders ซ้ำๆ และสรุป context ให้กระชับ

---

## 🎯 ปัญหาที่แก้

### **Context บวม (Context Bloat) เกิดจาก:**
- System reminders ซ้ำๆ กันหลายร้อยบรรทัด
- ทุกครั้งที่แก้ไฟล์ → system เตือนว่าไฟล์ถูกแก้ (ซ้ำๆ)
- Context เต็มเร็ว → AI ช้าลง + ตัดสินใจผิด

---

## 🚀 การติดตั้ง

### **1. ติดตั้ง dependencies:**

```bash
cd mcp-tools
npm install
```

### **2. เพิ่ม MCP Server เข้าไปใน config:**

แก้ไฟล์: `C:\Users\Wichaya\AppData\Roaming\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "context-manager": {
      "command": "node",
      "args": ["d:\\เขียน APP\\aircon-service-master\\aircon-service-master\\aircon-service-master\\mcp-tools\\context-manager-mcp.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

### **3. Restart Claude Code**

---

## 🛠️ Tools ที่มี

### **1. analyze_context**
วิเคราะห์ขนาดและปัญหาของ context

```javascript
{
  "contextPath": "./context.txt"
}
```

**ผลลัพธ์:**
- ขนาด context (KB)
- จำนวน system reminders
- ประมาณการ tokens
- คำแนะนำในการปรับปรุง

---

### **2. clean_context**
ล้าง context ให้กระชับ

```javascript
{
  "contextPath": "./context.txt",
  "options": {
    "keepLatest": true,      // เก็บเฉพาะ system reminder ล่าสุด
    "removeAll": false,      // ลบ system reminders ทั้งหมด
    "summarize": true,       // สรุป context ถ้าใหญ่เกินไป
    "outputPath": "./cleaned.txt"  // บันทึกไฟล์ที่ล้างแล้ว
  }
}
```

---

### **3. optimize_context**
ปรับปรุง context อัตโนมัติ (analyze + clean ในคำสั่งเดียว)

```javascript
{
  "contextPath": "./context.txt",
  "outputPath": "./optimized.txt"
}
```

---

## 📖 วิธีใช้งาน

### **วิธีที่ 1: CLI Mode**

```bash
# วิเคราะห์ context
node mcp-tools/context-manager.js analyze ./context.txt

# ล้าง context
node mcp-tools/context-manager.js clean ./context.txt ./cleaned.txt

# ปรับปรุงอัตโนมัติ
node mcp-tools/context-manager.js optimize ./context.txt ./optimized.txt
```

### **วิธีที่ 2: MCP Mode (ใน Claude Code)**

หลังจากติดตั้ง MCP Server แล้ว สามารถเรียกใช้ได้เลย:

```
"วิเคราะห์ context ให้หน่อย"
"ล้าง context ให้กระชับ"
"ปรับปรุง context อัตโนมัติ"
```

---

## 📊 ตัวอย่างผลลัพธ์

### **ก่อน:**

```
Total Size: 150.5 KB
Total Lines: 5,234
System Reminders: 47 รายการ
Estimated Tokens: 37,625

❌ ปัญหา:
- System reminders ซ้ำๆ (47 รายการ)
- Context ใหญ่เกิน 50 KB
- ประมาณการ tokens สูง
```

### **หลังใช้ clean_context:**

```
Total Size: 45.2 KB
Total Lines: 1,567
System Reminders: 1 รายการ
Estimated Tokens: 11,300

✅ ปรับปรุง:
- ลดขนาดลง 70%
- ลด system reminders จาก 47 → 1
- ลด tokens ลง 69.9%
```

---

## 🎯 กลยุทธ์การใช้งาน

### **1. ใช้เป็นระยะ**
- วิเคราะห์ context ทุกๆ 30 นาที
- ล้าง context เมื่อเริ่มช้าลง

### **2. ก่อน Commit**
- ใช้ `optimize_context` ก่อน commit ใหญ่ๆ
- ช่วยลด context ที่จะถูกส่งต่อ

### **3. หลังการแก้ไขไฟล์จำนวนมาก**
- ถ้าแก้ไฟล์ 10+ ไฟล์ ในครั้งเดียว
- system reminders จะซ้ำกันเยอะ
- ใช้ `clean_context` ทันที

---

## 🔧 Configuration

### **แก้ไขขีดจำกัด:**

แก้ไฟล์: `mcp-tools/context-manager.js`

```javascript
const CONFIG = {
  MAX_CONTEXT_SIZE: 50000, // ตัวอักษร (default: 50 KB)
  SYSTEM_REMINDER_REGEX: /<system-reminder>[\s\S]*?<\/system-reminder>/g,
  DUPLICATE_WARNING_THRESHOLD: 3, // จำนวนครั้งที่จะถือว่าซ้ำ
};
```

---

## 💡 Tips

1. **ใช้ร่วมกับ Git Hooks**
   - เพิ่ม `clean_context` เข้าไปใน pre-commit hook
   - ช่วยลด context ก่อน commit

2. **ตั้งเวลาอัตโนมัติ**
   - ใช้ `cron` หรือ `Task Scheduler`
   - วิเคราะห์ context ทุกๆ 1 ชั่วโมง

3. **Monitoring**
   - เก็บ log ขนาด context
   - ดู trend ว่า context โตขึ้นหรือไม่

---

## 🐛 Troubleshooting

### **ปัญหา: MCP Server ไม่ทำงาน**

```bash
# ตรวจสอบว่า node และ npm ติดตั้งหรือไม่
node --version
npm --version

# ติดตั้ง dependencies
cd mcp-tools
npm install

# รัน server เพื่อทดสอบ
npm start
```

### **ปัญหา: Context ไม่ลดลง**

- เช็คว่า path ถูกต้องหรือไม่
- ลองใช้ `removeAll: true`
- ลองใช้ `summarize: true`

---

## 📝 License

MIT

---

**สร้างเมื่อ:** 21 กุมภาพันธ์ 2026
**ผู้สร้าง:** Wichaya Sitthirit

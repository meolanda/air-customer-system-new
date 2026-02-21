# 🛡️ Adversarial Agent - Agent จับผิด Agent

ระบบที่ให้ **Agent ตรวจสอบงานของ Agent อื่น** - เหมือกับการมี Code Reviewer 2 คนที่เอาจริงกัน

---

## 🎯 แนวคิด

### **หลักการทำงาน:**

```
┌─────────────────────────────────────────────────────────┐
│                 ADVERSARIAL AGENT                      │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  Agent A (Developer)                                   │
│    ↓                                                    │
│  เขียนโค้ด / ทำงาน                                     │
│    ↓                                                    │
│  ┌──────────────────┐                                  │
│  │ Agent B (Checker) │                                  │
│  └──────────────────┘                                  │
│    ↓                                                    │
│  ตรวจสอบ / จับผิด / ท้าทาน                          │
│    ↓                                                    │
│  สรุปผล:                                             │
│  • ปัญหาที่เจอก                                       │
│  • คำแนะนำการแก้ไข                                   │
│  • บล็อก commit ถ้ามี critical issues                   │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

---

## 🔧 วิธีใช้งาน

### **Option 1: CLI Mode**

```bash
# Review directory ทั้งหมด
node adversarial-agent.js review ./src

# Review เฉพาะไฟล์
node adversarial-agent.js review ./src/index.ts

# Review ด้วย agent เฉพาะ
node adversarial-agent.js review ./src security
node adversarial-agent.js review ./src quality
node adversarial-agent.js review ./src performance
```

### **Option 2: ใช้กับ Pre-commit Hook**

เพิ่มใน `.git/hooks/pre-commit`:

```bash
# รัน Adversarial Agent ก่อน commit
node adversarial-agent.js review ./src comprehensive

# เช็ค exit code
if [ $? -ne 0 ]; then
  echo "🚨 ADVERSARIAL AGENT BLOCKED COMMIT!"
  exit 2
fi
```

---

## 🤖 Agent Types

### **1. Security Sentinel** 🛡️

**รอยรับ:** Security vulnerabilities

**Rules:**
- ❌ ห้าม `eval()` - เสี่ยงต่อความปลอดภัย
- ❌ ห้าม hardcoded secrets (API keys, passwords)
- ⚠️ เตือน console.log ใน production

```bash
node adversarial-agent.js review ./src security
```

---

### **2. Code Quality Guardian** 📝

**รอยรับ:** คุณภาพโค้ด

**Rules:**
- ❌ ตัวแปรที่ไม่ได้ใช้
- ℹ️ Magic numbers
- ⚠️ Long functions (> 100 lines)

```bash
node adversarial-agent.js review ./src quality
```

---

### **3. Performance Monitor** ⚡

**รอยรับ:** ประสิทธิภาพ

**Rules:**
- 🚨 Infinite loops
- ⚠️ ไฟล์ใหญ่เกินไป (> 500 lines)

```bash
node adversarial-agent.js review ./src performance
```

---

### **4. Comprehensive Reviewer** 🔍

**รอยรับ:** ทุกอย่าง (ทั้งหมด)

**รวม rules จากทุก agent**

```bash
node adversarial-agent.js review ./src comprehensive
```

---

## 📊 รูปแบบรายงาน

```
╔══════════════════════════════════════════════════════════════╗
║                  🛡️ ADVERSARIAL AGENT REPORT                  ║
╚══════════════════════════════════════════════════════════════╝

Agent: Comprehensive Reviewer
Role: ตรวจสอบครบถุมทุกด้าน
Total Violations: 23

📊 Violations by Severity:

  🚨 CRITICAL: 2
  ❌ HIGH: 8
  ⚠️ MEDIUM: 10
  ℹ️ LOW: 3

🔍 Top Issues:

  • no-console-log-in-production: 15
  • no-unused-vars: 5
  • no-magic-numbers: 3

============================================================
```

---

## 🚨 Exit Codes

| Exit Code | ความหมาย |
|-----------|-----------|
| **0** | ผ่านการตรวจสอบ ✅ |
| **1** | General error |
| **2** | Critical violations (commit blocked) |

---

## 💡 การใช้ร่วมกับระบบอื่น

### **1. กับ TypeScript Strict Mode**

```
┌─────────────────────────────────────┐
│  TypeScript Strict Mode               │
│  → Compile-time type checking       │
└─────────────────────────────────────┘
              +
┌─────────────────────────────────────┐
│  Adversarial Agent                   │
│  → Runtime security/quality check    │
└─────────────────────────────────────┘
              =
       🛡️ Protection ครบครัน!
```

### **2. กับ Guardrails**

```
┌─────────────────────────────────────┐
│  Guardrails                          │
│  → ป้องกันแก้ไฟล์ Test           │
└─────────────────────────────────────┘
              +
┌─────────────────────────────────────┐
│  Adversarial Agent                   │
│  → ป้องกัน security/quality issues │
└─────────────────────────────────────┘
              =
     🛡️🛡️ Double Protection!
```

### **3. กับ Context Manager**

```
┌─────────────────────────────────────┐
│  Context Manager                     │
│  → ลด context บวม                  │
└─────────────────────────────────────┘
              +
┌─────────────────────────────────────┐
│  Adversarial Agent                   │
│  → ตรวจสอบ code ที่ลด context      │
└─────────────────────────────────────┘
              =
    ⚡ ตรวจสอบเร็วขึ้น!
```

---

## 🎯 ตัวอย่างการใช้งาน

### **Scenario 1: ก่อน Commit**

```bash
# 1. Agent A เขียนโค้ดเสร็จ
git add .

# 2. Agent B ตรวจสอบ
node adversarial-agent.js review ./src comprehensive

# 3. ถ้าผ่าน → commit ได้
git commit -m "feat: add feature"

# 4. ถ้าไม่ผ่าน → แก้ก่อน commit
# แล้วรัน agent อีกครั้ง
```

### **Scenario 2: Continuous Integration**

```yaml
# .github/workflows/adversarial-review.yml
name: Adversarial Review

on: [pull_request]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Run Adversarial Agent
        run: |
          node adversarial-agent.js review ./src comprehensive
```

---

## 📝 การเพิ่ม Rules ใหม่

### **สร้าง Custom Rule:**

```javascript
const customRule = new ReviewRule(
  'no-todos',
  'ห้ามทิ้ง TODO ไว้ในโค้ด',
  'medium',
  (filePath, lines, content) => {
    const violations = [];
    lines.forEach((line, index) => {
      if (/TODO:|FIXME:|HACK:/.test(line)) {
        violations.push({
          message: `Found TODO/FIXME/HACK at line ${index + 1}`,
          line: index + 1,
          code: line.trim(),
        });
      }
    });
    return violations;
  }
);
```

---

## 🔧 Configuration

### **แก้ไขค่าต่างๆ:**

```javascript
const CONFIG = {
  REVIEW_DEPTH: 'deep',
  STRICT_MODE: true,
  MAX_VIOLATIONS_BEFORE_BLOCK: 10,
};
```

---

## 💬 Best Practices

1. **ใช้หลาย agents ร่วมกัน**
   - Security + Quality + Performance
   - แต่ละคนเชี่ยวชาญด้านต่าง

2. **ตั้งค่า severity ให้เหมาะสม**
   - Critical = block commit
   - High/medium/low = warning

3. **รวมกับ CI/CD**
   - รันใน GitHub Actions / GitLab CI
   - Block PR ถ้ามี critical violations

4. **ทบทวนรายงาน**
   - ดู top issues ให้เป็น priority
   - Fix จากความสำคัญ

---

**สร้างเมื่อ:** 21 กุมภาพันธ์ 2026
**ผู้สร้าง:** Wichaya Sitthirit

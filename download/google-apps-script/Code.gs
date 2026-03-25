/**
 * ❄️ ระบบรับงานบริการแอร์ - Google Apps Script
 * 
 * วิธีใช้งาน:
 * 1. สร้าง Google Sheets ใหม่
 * 2. Extensions > Apps Script
 * 3. ลบโค้ดเดิม แล้ว Paste โค้ดนี้ทั้งหมด
 * 4. กด Save
 * 5. Deploy > New deployment > Web app
 */

// ==================== CONFIGURATION ====================

const CONFIG = {
  SHEET_NAME: 'งานบริการ',
  USERS_SHEET: 'Users',
  TECHNICIANS_SHEET: 'ช่าง',
  DRIVE_FOLDER_NAME: 'Aircon Service Images',
  CALENDAR_ID: 'c_fbb2cc1ab73bbed8f0db9d604c78d123e5fec24af3a5a9bc503aafbd1fd893b8@group.calendar.google.com'
}

// ==================== WEB APP ENDPOINTS ====================

// Serve HTML page
function doGet(e) {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('ระบบรับงานบริการแอร์')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
}

// Include partial files
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename)
    .getContent();
}

// ==================== DATA OPERATIONS ====================

// Get all service requests (with 5-min cache)
function getRequests() {
  // Try cache first
  const cache = CacheService.getScriptCache();
  const cached = cache.get('requests_v1');
  if (cached) {
    try { return JSON.parse(cached); } catch(e) {}
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    logErrorToSheet('ERROR: No active spreadsheet found!');
    return [];
  }

  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    logErrorToSheet('ERROR: Sheet not found!');
    return [];
  }

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return [];
  }

  const headers = data[0];
  const requests = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[0]) {
      const obj = {};
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j]] = row[j] || '';
      }
      requests.push(obj);
    }
  }

  const result = JSON.parse(JSON.stringify(requests));

  // Store in cache for 5 minutes (300 seconds)
  try { cache.put('requests_v1', JSON.stringify(result), 300); } catch(e) {}

  return result;
}

// Helper function to log errors to a debug sheet
function logErrorToSheet(message) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let debugSheet = ss.getSheetByName('Debug Log');

    if (!debugSheet) {
      debugSheet = ss.insertSheet('Debug Log');
      debugSheet.appendRow(['Timestamp', 'Message']);
      debugSheet.setColumnWidth(1, 200);
      debugSheet.setColumnWidth(2, 500);
    }

    // Rotate: ถ้า > 500 data rows → ลบเก่าออก เหลือแค่ 200 rows ล่าสุด
    const lastRow = debugSheet.getLastRow();
    if (lastRow > 501) {
      debugSheet.deleteRows(2, lastRow - 201);
    }

    const timestamp = new Date().toISOString() + ' (' + new Date().toLocaleString('th-TH') + ')';
    debugSheet.appendRow([timestamp, message]);
  } catch (e) {
    // Ignore logging errors
  }
}

// Add new request
function addRequest(request) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getOrCreateSheet()
    const headers = getHeaders()

    // Generate ID and Request No
    request.id = Date.now().toString()
    request.requestNo = generateRequestNo()
    request.createdAt = new Date().toISOString()
    // Create history
    const history = [{
      status: 'new',
      date: new Date().toISOString(),
      by: request.by || 'System'
    }];

    // If initial status is not new, add it to history as a second step
    if (request.status && request.status !== 'new') {
      history.push({
        status: request.status,
        date: new Date(Date.now() + 1000).toISOString(), // Add 1s to ensure order
        by: request.by || 'System'
      });
    }

    request.history = JSON.stringify(history)

    // Add row
    const row = objectToRow(request, headers)
    sheet.appendRow(row)

    // Clear cache
    CacheService.getScriptCache().remove('requests_v1');

    return { success: true, data: request }
  } finally {
    lock.releaseLock();
  }
}

// Update request
function updateRequest(request) {
  const sheet = getOrCreateSheet()
  const data = sheet.getDataRange().getValues()
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == request.id) {
      const headers = data[0]
      const existing = rowToObject(data[i], headers)
      
      // Update history if status changed
      if (request.status && request.status !== existing.status) {
        let history = []
        try {
          history = JSON.parse(existing.history || '[]')
        } catch (e) {}
        history.push({
          status: request.status,
          date: new Date().toISOString(),
          by: request.by || 'System'
        })
        request.history = JSON.stringify(history)
      }
      
      // Merge data
      const updated = { ...existing, ...request }
      const row = objectToRow(updated, headers)
      
      // Update row
      sheet.getRange(i + 1, 1, 1, row.length).setValues([row])
      
      // Clear cache
      CacheService.getScriptCache().remove('requests_v1');
      
      return { success: true, data: updated }
    }
  }
  
  return { success: false, error: 'Not found' }
}

// Wrapper: js.html เรียก createRequest แต่ฟังก์ชันจริงชื่อ addRequest
function createRequest(data) {
  return addRequest(data);
}

// Update status only (called from quick-action buttons in js.html)
// byName: ชื่อคนที่เปลี่ยนสถานะ (ส่งมาจาก js.html)
function updateStatus(id, newStatus, byName) {
  const sheet = getOrCreateSheet();
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == id) {
      const headers = data[0];
      const existing = rowToObject(data[i], headers);

      // Append to history
      let history = [];
      try { history = JSON.parse(existing.history || '[]'); } catch (e) {}
      history.push({
        status: newStatus,
        date: new Date().toISOString(),
        by: byName || 'System'
      });

      existing.status = newStatus;
      existing.history = JSON.stringify(history);

      const row = objectToRow(existing, headers);
      sheet.getRange(i + 1, 1, 1, row.length).setValues([row]);
      CacheService.getScriptCache().remove('requests_v1');
      return { success: true };
    }
  }
  return { success: false, error: 'Not found' };
}

// Delete request
function deleteRequest(id) {

  const sheet = getOrCreateSheet()
  const data = sheet.getDataRange().getValues()
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == id) {
      sheet.deleteRow(i + 1)
      // Clear cache
      CacheService.getScriptCache().remove('requests_v1');
      return { success: true }
    }
  }
  
  return { success: false, error: 'Not found' }
}

// ==================== USER MANAGEMENT ====================

function getUsers() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  let sheet = ss.getSheetByName(CONFIG.USERS_SHEET)
  
  if (!sheet) {
    setupUsers() // Create if not exists
    sheet = ss.getSheetByName(CONFIG.USERS_SHEET)
  }
  
  const data = sheet.getDataRange().getValues()
  if (data.length <= 1) return []
  
  const users = []
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) {
      users.push({
        id: data[i][0],
        name: data[i][1]
      })
    }
  }
  
  return users
}

function setupUsers() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  let sheet = ss.getSheetByName(CONFIG.USERS_SHEET)

  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.USERS_SHEET)
    sheet.appendRow(['id', 'name'])

    // Default users (name only, no department)
    const defaultUsers = [
      ['u1', 'คุณเนย'],
      ['u2', 'คุณฟิล์ม'],
      ['u3', 'คุณตุ้ม'],
      ['u4', 'คุณดอย'],
      ['u5', 'คุณดอจ'],
      ['u6', 'คุณออมสิน'],
      ['u7', 'คุณเผือก']
    ]

    defaultUsers.forEach(u => sheet.appendRow(u))

    // Style
    const range = sheet.getRange(1, 1, 1, 2)
    range.setBackground('#4F46E5')
    range.setFontColor('white')
    range.setFontWeight('bold')
  }
}

// ==================== IMAGE UPLOAD ====================

// Upload image to Google Drive
function uploadImage(base64Data, fileName) {
  try {
    const folder = getOrCreateDriveFolder()
    
    // Decode base64
    const mimeType = base64Data.split(';')[0].split(':')[1]
    const base64 = base64Data.split(',')[1]
    const blob = Utilities.newBlob(
      Utilities.base64Decode(base64),
      mimeType,
      fileName || `image_${Date.now()}.png`
    )
    
    // Create file
    const file = folder.createFile(blob)
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW)
    
    // Return URL
    const fileId = file.getId()
    const url = `https://drive.google.com/uc?export=view&id=${fileId}`
    
    return { success: true, url: url }
  } catch (error) {
    return { success: false, error: error.toString() }
  }
}

// ==================== FILE UPLOAD (PDF / Documents) ====================

// Upload any file (PDF, doc, etc.) to Google Drive
// Returns a Google Drive view URL
function uploadFile(base64Data, fileName) {
  try {
    const folder = getOrCreateDriveFolder()

    const mimeType = base64Data.split(';')[0].split(':')[1]
    const base64 = base64Data.split(',')[1]
    const blob = Utilities.newBlob(
      Utilities.base64Decode(base64),
      mimeType,
      fileName || `file_${Date.now()}.pdf`
    )

    const file = folder.createFile(blob)
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW)

    const fileId = file.getId()
    // ใช้ /file/d/.../view เพื่อเปิดใน Google Drive Viewer (ดู PDF ได้ใน browser)
    const url = `https://drive.google.com/file/d/${fileId}/view`

    return { success: true, url: url, fileId: fileId, fileName: fileName }
  } catch (error) {
    return { success: false, error: error.toString() }
  }
}

// ==================== HELPER FUNCTIONS ====================

// Get or create main sheet
function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME)
  
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME)
    // Add headers
    sheet.appendRow(getHeaders())
    
    // Format header row
    const headerRange = sheet.getRange(1, 1, 1, getHeaders().length)
    headerRange.setBackground('#4F46E5')
    headerRange.setFontColor('white')
    headerRange.setFontWeight('bold')
    sheet.setFrozenRows(1)
    
    // Set column widths
    sheet.setColumnWidth(1, 120) // ID
    sheet.setColumnWidth(2, 150) // Request No
    sheet.setColumnWidth(3, 150) // Created At
    sheet.setColumnWidth(5, 150) // Customer Name
    sheet.setColumnWidth(6, 120) // Phone
  }
  
  return sheet
}

// Get column headers
function getHeaders() {
  return [
    'id', 'requestNo', 'createdAt', 'channel', 'customerName',
    'phone', 'address', 'serviceType', 'description', 'priority',
    'status', 'appointmentDate', 'notes', 'imageUrl', 'pdfUrl', 'pdfFileName', 'history'
  ]
}

// Convert row to object
function rowToObject(row, headers) {
  const obj = {}
  headers.forEach((h, i) => {
    obj[h] = row[i] || ''
  })
  return obj
}

// Convert object to row
function objectToRow(obj, headers) {
  return headers.map(h => obj[h] || '')
}

// Generate request number
function generateRequestNo() {
  const date = new Date()
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '')
  
  const sheet = getOrCreateSheet()
  const data = sheet.getDataRange().getValues()
  
  let count = 0
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] && data[i][1].includes(dateStr)) {
      count++
    }
  }
  
  return `REQ-${dateStr}-${(count + 1).toString().padStart(3, '0')}`
}

// Get or create Drive folder
function getOrCreateDriveFolder() {
  const folders = DriveApp.getFoldersByName(CONFIG.DRIVE_FOLDER_NAME)
  
  if (folders.hasNext()) {
    return folders.next()
  }
  
  return DriveApp.createFolder(CONFIG.DRIVE_FOLDER_NAME)
}

// ==================== AI ANALYSIS ====================

// Analyze image/screenshot with Gemini Vision
function analyzeImageWithAI(base64Data) {
  try {
    const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!apiKey) return { success: false, error: 'ไม่พบ GEMINI_API_KEY ใน Script Properties' };

    const mimeType = base64Data.split(';')[0].split(':')[1];
    const base64 = base64Data.split(',')[1];

    const prompt = `วิเคราะห์รูปภาพหรือข้อความจากลูกค้าที่ต้องการใช้บริการแอร์คอนดิชั่น
แยกข้อมูลและตอบกลับเป็นรูปแบบ JSON เท่านั้น โดยปฏิบัติตามกฎต่อไปนี้อย่างเคร่งครัด:

1. customerName: "ระบุเฉพาะชื่อบุคคล, แสลงเรียกบุคคล หรือ แบรนด์/บริษัท/องค์กร เท่านั้น" (ตัวอย่าง: KFC, สตาร์บัคส์, พี่สมชาย, น้องเอ)
   ***ข้อควรระวังขั้นเด็ดขาด: ห้ามนำ "คำกริยา, คำสั่ง หรือรายละเอียดงาน" (เช่น "ราคาติดตั้ง...", "ส่งช่าง...", "แอร์ไม่เย็น") มาใส่ในช่องนี้เด็ดขาด หากข้อความไม่มีชื่อคนหรือแบรนด์ชัดเจน ให้เว้นว่างไว้ ("")***
2. phone: "เบอร์โทรศัพท์" (ถ้ามี)
3. address: "ชื่อสาขา, ชื่อโครงการ, หมู่บ้าน, สถานที่, หรือที่อยู่" (ตัวอย่าง: โฮมเวิร์คพัทยา, มาร์เก็ตเพลส เทพรักษ์, พลัมคอนโด) *สำคัญ: ให้สกัดชื่อสถานที่มาใส่ช่องนี้เสมอ อย่าปะปนกับชื่อลูกค้า*
4. serviceType: เลือก 1 ในหมวดหมู่ต่อไปนี้เท่านั้น: "ล้างแอร์", "ซ่อม", "ติดตั้ง", "ตรวจสอบ" หรือ "อื่นๆ"
5. priority: เลือกระดับความเร่งด่วน: "normal", "urgent", "emergency"
6. description: "สรุปรายละเอียดคำสั่งงาน อาการแอร์ หรือสิ่งที่ลูกค้าต้องการทั้งหมด" (ตัวอย่าง: ราคาติดตั้ง CDU แอร์ขนาด 120,000 BTU ได้วันไหนครับ, ส่งช่างเข้าตรวจสอบระบบฮู้ดให้ด้วยครับ)

ตอบเป็น JSON ล้วนๆ ห้ามมีเครื่องหมาย markdown หรือ \`\`\` ครอบ และห้ามมีคำอธิบายเพิ่มเติม:
{"customerName":"","phone":"","address":"","serviceType":"","priority":"","description":""}`;

    const payload = {
      contents: [{ parts: [
        { text: prompt },
        { inline_data: { mime_type: mimeType, data: base64 } }
      ]}],
      generationConfig: { response_mime_type: 'application/json' }
    };

    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey;
    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const json = JSON.parse(response.getContentText());
    if (json.error) return { success: false, error: json.error.message };

    const text = json.candidates[0].content.parts[0].text;
    const data = JSON.parse(text);
    return { success: true, data: data };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// Analyze text (voice transcript) with Gemini
function analyzeTextWithAI(text) {
  try {
    const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!apiKey) return { success: false, error: 'ไม่พบ GEMINI_API_KEY ใน Script Properties' };

    const prompt = 'วิเคราะห์ข้อความต่อไปนี้จากลูกค้าที่ต้องการใช้บริการแอร์คอนดิชั่น:\n"' + text + '"\n\nแยกข้อมูลและตอบกลับเป็นรูปแบบ JSON เท่านั้น โดยปฏิบัติตามกฎต่อไปนี้อย่างเคร่งครัด:\n\n1. customerName: "ระบุเฉพาะชื่อบุคคล, แสลงเรียกบุคคล หรือ แบรนด์/บริษัท/องค์กร เท่านั้น" (ตัวอย่าง: KFC, สตาร์บัคส์, พี่สมชาย, น้องเอ)\n   ***ข้อควรระวังขั้นเด็ดขาด: ห้ามนำ "คำกริยา, คำสั่ง หรือรายละเอียดงาน" (เช่น "ราคาติดตั้ง...", "ส่งช่าง...", "แอร์ไม่เย็น") มาใส่ในช่องนี้เด็ดขาด หากข้อความไม่มีชื่อคนหรือแบรนด์ชัดเจน ให้เว้นว่างไว้ ("")***\n2. phone: "เบอร์โทรศัพท์" (ถ้ามี)\n3. address: "ชื่อสาขา, ชื่อโครงการ, หมู่บ้าน, สถานที่, หรือที่อยู่" (ตัวอย่าง: โฮมเวิร์คพัทยา, มาร์เก็ตเพลส เทพรักษ์, พลัมคอนโด) *สำคัญ: ให้สกัดชื่อสถานที่มาใส่ช่องนี้เสมอ อย่าปะปนกับชื่อลูกค้า*\n4. serviceType: เลือก 1 ในหมวดหมู่ต่อไปนี้เท่านั้น: "ล้างแอร์", "ซ่อม", "ติดตั้ง", "ตรวจสอบ" หรือ "อื่นๆ"\n5. priority: เลือกระดับความเร่งด่วน: "normal", "urgent", "emergency"\n6. description: "สรุปรายละเอียดคำสั่งงาน อาการแอร์ หรือสิ่งที่ลูกค้าต้องการทั้งหมด" (ตัวอย่าง: ราคาติดตั้ง CDU แอร์ขนาด 120,000 BTU ได้วันไหนครับ, ส่งช่างเข้าตรวจสอบระบบฮู้ดให้ด้วยครับ)\n\nตอบเป็น JSON ล้วนๆ ห้ามมีเครื่องหมาย markdown หรือ ``` ครอบ และห้ามมีคำอธิบายเพิ่มเติม:\n{"customerName":"","phone":"","address":"","serviceType":"","priority":"","description":""}';

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { response_mime_type: 'application/json' }
    };

    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey;
    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const json = JSON.parse(response.getContentText());
    if (json.error) return { success: false, error: json.error.message };

    const resultText = json.candidates[0].content.parts[0].text;
    const data = JSON.parse(resultText);
    return { success: true, data: data };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ==================== PDF ANALYSIS WITH AI ====================

// Analyze PDF with Gemini — ถอดข้อความ + สกัดข้อมูลงานบริการแอร์
function analyzePdfWithAI(base64Data) {
  try {
    const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!apiKey) return { success: false, error: 'ไม่พบ GEMINI_API_KEY ใน Script Properties' };

    const base64 = base64Data.split(',')[1];

    const prompt = `อ่านและวิเคราะห์เนื้อหาจากเอกสาร PDF นี้ที่เกี่ยวกับงานบริการแอร์คอนดิชั่น
แยกข้อมูลและตอบกลับเป็นรูปแบบ JSON เท่านั้น โดยปฏิบัติตามกฎต่อไปนี้อย่างเคร่งครัด:

1. customerName: "ระบุเฉพาะชื่อบุคคล, แสลงเรียกบุคคล หรือ แบรนด์/บริษัท/องค์กร เท่านั้น"
   ***ห้ามนำคำกริยา, คำสั่ง หรือรายละเอียดงานมาใส่ หากไม่มีชื่อชัดเจน ให้เว้นว่างไว้ ("")***
2. phone: "เบอร์โทรศัพท์" (ถ้ามี)
3. address: "ชื่อสาขา, ชื่อโครงการ, หมู่บ้าน, สถานที่, หรือที่อยู่"
4. serviceType: เลือก 1 ในหมวดหมู่: "ล้างแอร์", "ซ่อม", "ติดตั้ง", "ตรวจสอบ" หรือ "อื่นๆ"
5. priority: เลือกระดับความเร่งด่วน: "normal", "urgent", "emergency"
6. description: "สรุปรายละเอียดคำสั่งงาน อาการแอร์ หรือสิ่งที่ลูกค้าต้องการทั้งหมด"
7. rawText: "ข้อความทั้งหมดที่อ่านได้จาก PDF (คัดลอกมาครบถ้วน เพื่อแสดงผล)"

ตอบเป็น JSON ล้วนๆ ห้ามมีเครื่องหมาย markdown หรือ \`\`\` ครอบ และห้ามมีคำอธิบายเพิ่มเติม:
{"customerName":"","phone":"","address":"","serviceType":"","priority":"","description":"","rawText":""}`;

    const payload = {
      contents: [{ parts: [
        { text: prompt },
        { inline_data: { mime_type: 'application/pdf', data: base64 } }
      ]}],
      generationConfig: { response_mime_type: 'application/json' }
    };

    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey;
    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const json = JSON.parse(response.getContentText());
    if (json.error) return { success: false, error: json.error.message };

    const text = json.candidates[0].content.parts[0].text;
    const data = JSON.parse(text);
    return { success: true, data: data };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ==================== LIST MODELS (DIAGNOSTIC) ====================

// รันฟังก์ชันนี้ใน GAS Editor เพื่อดูว่า API key รองรับ model อะไรบ้าง
// เลือก listAvailableModels ใน dropdown แล้วกด Run ▶
function listAvailableModels() {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    Logger.log('❌ ไม่พบ GEMINI_API_KEY ใน Script Properties');
    return;
  }

  const url = 'https://generativelanguage.googleapis.com/v1beta/models?key=' + apiKey;
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const json = JSON.parse(response.getContentText());

  if (json.error) {
    Logger.log('❌ Error: ' + json.error.message);
    return;
  }

  Logger.log('✅ Models ที่ใช้ generateContent ได้:');
  (json.models || []).forEach(function(m) {
    const supported = (m.supportedGenerationMethods || []);
    if (supported.indexOf('generateContent') !== -1) {
      Logger.log('  → ' + m.name + ' (' + m.displayName + ')');
    }
  });
}

// ==================== SETUP FUNCTION ====================

// Run this once to setup
function setup() {
  getOrCreateSheet()
  getOrCreateDriveFolder()
  setupUsers()
  Logger.log('Setup complete!')
}

// ==================== DIAGNOSTICS ====================

// รันฟังก์ชันนี้ใน Apps Script Editor เพื่อตรวจสอบปัญหา
// (เลือก runDiagnostics ในช่อง dropdown แล้วกด Run ▶)
function runDiagnostics() {
  const r = {};

  // 1. Spreadsheet
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    r.spreadsheet = '✅ OK: ' + ss.getName();
  } catch (e) { r.spreadsheet = '❌ ' + e.message; }

  // 2. Sheets
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    r.sheets = ss.getSheets().map(s => s.getName());
  } catch (e) { r.sheets = '❌ ' + e.message; }

  // 3. Script Properties (API Key)
  try {
    const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    r.geminiApiKey = key ? '✅ SET (length=' + key.length + ')' : '❌ NOT SET - ต้องไปตั้งใน Project Settings > Script Properties';
  } catch (e) { r.geminiApiKey = '❌ ' + e.message; }

  // 4. UrlFetchApp (Gemini endpoint)
  try {
    const res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/', { muteHttpExceptions: true });
    r.urlFetch = '✅ OK (HTTP ' + res.getResponseCode() + ')';
  } catch (e) { r.urlFetch = '❌ ' + e.message; }

  // 5. Drive
  try {
    DriveApp.getRootFolder();
    r.drive = '✅ OK';
  } catch (e) { r.drive = '❌ ' + e.message; }

  // 6. Users sheet
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName('Users');
    if (sh) {
      r.users = '✅ Found: ' + (sh.getLastRow() - 1) + ' users';
    } else {
      r.users = '⚠️ Users sheet ไม่มี - กรุณา run setup() ก่อน';
    }
  } catch (e) { r.users = '❌ ' + e.message; }

  // Print results
  Logger.log('========== DIAGNOSTICS ==========');
  for (const k in r) {
    Logger.log(k + ': ' + (Array.isArray(r[k]) ? r[k].join(', ') : r[k]));
  }
  Logger.log('=================================');
  return r;
}

// ==================== USER MANAGEMENT API ====================

// Add new user (name only, no department)
function addUser(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  let sheet = ss.getSheetByName(CONFIG.USERS_SHEET)
  if (!sheet) { setupUsers(); sheet = ss.getSheetByName(CONFIG.USERS_SHEET) }
  const newId = 'user_' + Date.now()
  sheet.appendRow([newId, name])
  
  // Return updated users list
  const data = sheet.getDataRange().getValues()
  const users = data.slice(1).filter(row => row[0]).map(row => ({
    id: row[0],
    name: row[1]
  }))
  return { success: true, users: users }
}

// Delete user
function deleteUser(id) {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  const sheet = ss.getSheetByName(CONFIG.USERS_SHEET)
  const data = sheet.getDataRange().getValues()
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == id) {
      sheet.deleteRow(i + 1)
      
      // Return updated users list
      const newData = sheet.getDataRange().getValues()
      const users = newData.length > 1 ? newData.slice(1).filter(row => row[0]).map(row => ({
        id: row[0],
        name: row[1]
      })) : []
      return { success: true, users: users }
    }
  }
  return { success: false, error: 'User not found' }
}
// ==================== TECHNICIAN MANAGEMENT ====================

function setupTechnicians() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  let sheet = ss.getSheetByName(CONFIG.TECHNICIANS_SHEET)
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.TECHNICIANS_SHEET)
    sheet.appendRow(['id', 'name'])
    const defaults = [
      ['tech1', 'ช่างสมชาย'],
      ['tech2', 'ช่างสมศักดิ์'],
      ['tech3', 'ช่างสมปอง']
    ]
    defaults.forEach(r => sheet.appendRow(r))
    sheet.getRange(1, 1, 1, 2).setBackground('#059669').setFontColor('white').setFontWeight('bold')
  }
  return sheet
}

function getTechnicians() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  let sheet = ss.getSheetByName(CONFIG.TECHNICIANS_SHEET)
  if (!sheet) { setupTechnicians(); sheet = ss.getSheetByName(CONFIG.TECHNICIANS_SHEET) }
  const data = sheet.getDataRange().getValues()
  if (data.length <= 1) return []
  return data.slice(1).filter(r => r[0]).map(r => ({ id: r[0], name: r[1] }))
}

function addTechnician(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  let sheet = ss.getSheetByName(CONFIG.TECHNICIANS_SHEET)
  if (!sheet) { setupTechnicians(); sheet = ss.getSheetByName(CONFIG.TECHNICIANS_SHEET) }
  const id = 'tech_' + Date.now()
  sheet.appendRow([id, name])
  const data = sheet.getDataRange().getValues()
  return { success: true, technicians: data.slice(1).filter(r => r[0]).map(r => ({ id: r[0], name: r[1] })) }
}

function deleteTechnician(id) {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  const sheet = ss.getSheetByName(CONFIG.TECHNICIANS_SHEET)
  if (!sheet) return { success: false, error: 'Sheet not found' }
  const data = sheet.getDataRange().getValues()
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == id) {
      sheet.deleteRow(i + 1)
      const newData = sheet.getDataRange().getValues()
      return { success: true, technicians: newData.length > 1 ? newData.slice(1).filter(r => r[0]).map(r => ({ id: r[0], name: r[1] })) : [] }
    }
  }
  return { success: false, error: 'Not found' }
}

// ==================== CALENDAR INTEGRATION ====================

function createCalendarEvent(requestId, technicianName, dateTimeISO, durationMinutes, note) {
  try {
    // 1. Get calendar
    let cal
    try {
      cal = CalendarApp.getCalendarById(CONFIG.CALENDAR_ID)
      if (!cal) throw new Error('Calendar not found')
    } catch (e) {
      cal = CalendarApp.getDefaultCalendar()
    }

    // 2. Find the request
    const sheet = getOrCreateSheet()
    const data = sheet.getDataRange().getValues()
    const headers = data[0]
    let rowIndex = -1
    let requestObj = null
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(requestId)) {
        rowIndex = i + 1
        requestObj = rowToObject(data[i], headers)
        break
      }
    }
    if (rowIndex === -1) return { success: false, error: 'Request not found' }

    // 3. Create calendar event
    const start = new Date(dateTimeISO)
    const end = new Date(start.getTime() + (durationMinutes || 60) * 60000)
    const customerName = requestObj.customerName || ''
    const address = requestObj.address || ''
    const serviceType = requestObj.serviceType || ''
    const reqNo = requestObj.requestNo || requestId

    const title = customerName || ('งานบริการ ' + reqNo);
    const eventDescription = requestObj.description ? requestObj.description + '\n\n' : '';
    const eventPhone = requestObj.phone ? 'เบอร์ติดต่อร้าน ' + requestObj.phone + '\n\n' : '';
    const eventNote = note ? note + '\n\n' : '';
    
    // สร้าง Description เหมือนในรูปตัวอย่าง
    const description = eventDescription
      + eventPhone
      + eventNote
      + 'เลขงาน: ' + reqNo;

    const event = cal.createEvent(title, start, end, {
      description: description,
      location: address
    })
    const eventId = event.getId()

    // 4. Update sheet: add technicianName + calendarEventId
    // Check if columns exist, add if not
    const techColIdx = headers.indexOf('technicianName')
    const eventColIdx = headers.indexOf('calendarEventId')
    const lastCol = headers.length + 1
    
    if (techColIdx === -1) {
      sheet.getRange(1, lastCol).setValue('technicianName')
      headers.push('technicianName')
    }
    if (eventColIdx === -1) {
      sheet.getRange(1, headers.length + (techColIdx === -1 ? 0 : 1)).setValue('calendarEventId')
      headers.push('calendarEventId')
    }

    // Re-read headers after possible update
    const freshHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    requestObj.technicianName = technicianName
    requestObj.calendarEventId = eventId
    requestObj.appointmentDate = dateTimeISO

    const updatedRow = objectToRow(requestObj, freshHeaders)
    sheet.getRange(rowIndex, 1, 1, updatedRow.length).setValues([updatedRow])
    CacheService.getScriptCache().remove('requests_v1')

    return {
      success: true,
      eventId: eventId,
      eventLink: event.getId() ? 'https://calendar.google.com/calendar/r' : ''
    }
  } catch (e) {
    Logger.log('createCalendarEvent error: ' + e.message)
    return { success: false, error: e.message }
  }
}

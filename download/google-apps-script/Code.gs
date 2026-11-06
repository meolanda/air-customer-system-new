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
  if (e && e.parameter && e.parameter.action === 'searchCustomers') {
    return handleCustomerSearch_(e.parameter)
  }
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

// ==================== CUSTOMER SEARCH FROM CALENDAR ====================
// อ่านนัดเก่าในปฏิทินที่เป็นเจ้าของ เพื่อให้ฟอร์มรับงานดึงชื่อ/ผู้ติดต่อ/เบอร์/ที่อยู่เดิมมาเติม
// ตั้งค่าครั้งแรก: Project Settings > Script Properties เพิ่ม CUSTOMER_SEARCH_TOKEN (ข้อความสุ่มยาวๆ)
// แล้วรัน installCustomerIndexTrigger() หนึ่งครั้งจาก Apps Script Editor

const CUSTOMER_INDEX = {
  CACHE_KEY: 'customer_index_v1',
  CHUNK_SIZE: 90000,   // CacheService เก็บได้ค่าละไม่เกิน ~100KB
  TTL_SECONDS: 21600,  // 6 ชม. (สูงสุดของ CacheService)
  DAYS_BACK: 180,
  DAYS_AHEAD: 60,
  SKIP_CALENDARS: ['ใบเสนอราคา', 'วันหยุด', 'ทีมการตลาด', 'งานเลื่อน/งานยกเลิก']
}

// ตัวเลขแบบ 12,500 ถือเป็นเงิน ยกเว้นตามด้วย BTU (60,000 BTU เป็นขนาดแอร์) — ต้องตรงกับ src/lib/calendar-template.ts
const MONEY_LINE_RE = /(฿|บาท|ราคา|ยอด|ต้นทุน|กำไร|เก็บเงิน|วางบิล|ชำระ|มัดจำ|ส่วนลด|ภาษี|vat|\d{1,3}(,\d{3})+(\.\d+)?(?!\s*(btu|บีทียู)))/i
// (?<!\d)/(?!\d) กันไม่ให้ไปหยิบตัวเลขกลางเลข QT หรือเลขยาวอื่นมาเป็นเบอร์
const PHONE_RE = /(?<!\d)0\d{1,2}[-\s]?\d{3}[-\s]?\d{4}(?!\d)/
const MAP_URL_RE = /https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|www\.google\.com\/maps)[^\s"'<>]*/

function htmlToText_(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|ul|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

// ชื่อลูกค้า = ชื่อนัด ตัดคำนำหน้า/ป้ายสถานะที่ทีมใส่ เช่น "ขอคิว - ", "(งานต่อ)"
function cleanCustomerName_(title) {
  return String(title || '')
    .replace(/^[์\s]+/, '')
    .replace(/^ขอคิว\s*-\s*/, '')
    .replace(/\((?:งานต่อ|งานแก้|งานตกค้าง)\)/g, '')
    .replace(/\s*เบอร์โทร\s*[:：]?\s*0\d[\d\s-]{7,}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseCalendarEvent_(title, descriptionHtml, location, startTimeMs) {
  const text = htmlToText_(descriptionHtml)
  const lines = text.split('\n').map(function (l) { return l.trim() })

  let contactName = ''
  let phone = ''
  const contactRe = /ติดต่อ\s*((?:คุณ|พี่|น้อง|ช่าง)?\s*[^\d\n(]+?)\s*((?<!\d)0\d{1,2}[-\s]?\d{3}[-\s]?\d{4}(?!\d))/
  for (let i = 0; i < lines.length && !phone; i++) {
    const m = lines[i].match(contactRe)
    if (m) { contactName = m[1].trim(); phone = m[2].replace(/\s+/g, '') }
  }
  // "ติดต่อสาขา: 02-..." ไม่ใช่ชื่อคน ทิ้งไป
  contactName = contactName.replace(/[:：\s]+$/, '')
  if (/^(สาขา|ร้าน|เบอร์|โทร|ที่ร้าน)$/.test(contactName)) contactName = ''

  if (!phone) {
    const p = text.match(PHONE_RE)
    if (p) phone = p[0].replace(/\s+/g, '')
  }
  if (!phone) {
    const tp = String(title || '').match(PHONE_RE)  // บางนัดใส่เบอร์ไว้ในชื่อนัด
    if (tp) phone = tp[0].replace(/\s+/g, '')
  }

  let address = String(location || '').trim()
  if (!address) {
    const map = String(descriptionHtml || '').match(MAP_URL_RE)
    if (map) address = map[0]
  }

  // ข้อกำชับ = บรรทัดหลังคำว่า "สำคัญ" หรือ "เน้นย้ำ" จนถึงเลข QT หรือลิงก์ข้อปฏิบัติ (ตัดบรรทัดเรื่องเงิน)
  let emphasis = ''
  const idx = lines.findIndex(function (l) { return /สำคัญ|เน้นย้ำ/.test(l) })
  if (idx !== -1) {
    const kept = []
    for (let i = idx + 1; i < lines.length; i++) {
      const l = lines[i]
      if (/^QT/i.test(l) || l.indexOf('อ่านข้อปฏิบัติ') !== -1) break
      if (l && !MONEY_LINE_RE.test(l)) kept.push(l)
    }
    emphasis = kept.join('\n').slice(0, 600)
  }

  // ข้อมูลแอร์ในร้าน = บรรทัดใต้หัวข้อ "ข้อมูลแอร์..." จนถึงบรรทัดว่าง (ตัดบรรทัดเรื่องเงิน)
  let acInfo = ''
  const acIdx = lines.findIndex(function (l) { return /^ข้อมูลแอร์/.test(l) })
  if (acIdx !== -1) {
    const acKept = []
    for (let i = acIdx + 1; i < lines.length; i++) {
      const l = lines[i]
      if (!l || /^(\*|PM\s|QT)/i.test(l)) break  // จบหัวข้อ: บรรทัดว่าง / หัวข้อถัดไป (PM..., *** เน้นย้ำ ***, QT)
      if (!MONEY_LINE_RE.test(l)) acKept.push(l)
    }
    acInfo = acKept.join('\n').slice(0, REGISTRY_LIMITS.AC_TEXT)
  }

  return {
    name: cleanCustomerName_(title),
    contactName: contactName,
    phone: phone,
    address: address,
    emphasis: emphasis,
    acInfo: acInfo,
    time: startTimeMs || 0
  }
}

function normalizeCustomerKey_(name) {
  return String(name || '').toLowerCase().replace(/\s+/g, '')
}

// รวมนัดของลูกค้าเดียวกัน: นัดล่าสุดชนะ ช่องที่ว่างเติมจากนัดเก่า
function mergeCustomer_(map, rec) {
  const key = normalizeCustomerKey_(rec.name)
  if (!key) return
  const cur = map[key]
  if (!cur) {
    map[key] = { name: rec.name, contactName: rec.contactName, phone: rec.phone, address: rec.address, emphasis: rec.emphasis, acInfo: rec.acInfo || '', time: rec.time, count: 1 }
    return
  }
  cur.count += 1
  const newer = rec.time >= cur.time
  // ผู้ติดต่อกับเบอร์ไปด้วยกันเสมอ ไม่เอาชื่อจากนัดหนึ่งไปคู่กับเบอร์ของอีกนัด
  if (rec.phone && (newer || !cur.phone)) {
    cur.phone = rec.phone
    cur.contactName = rec.contactName
  }
  ;['address', 'emphasis', 'acInfo'].forEach(function (f) {
    if (rec[f] && (newer || !cur[f])) cur[f] = rec[f]
  })
  if (newer) { cur.name = rec.name; cur.time = rec.time }
}

// ---------- ทะเบียนลูกค้าจากชีท Handyman (อ่านอย่างเดียว ไม่แตะตัวเลขเงินเลย) ----------
// ตั้ง Script Property HANDYMAN_SHEET_ID = รหัสชีท "สรุปยอดขาย Handyman2026" (ไม่ใส่ในโค้ดเพราะ repo เป็น public)
// ใช้ 3 แท็บ: ข้อมูลลูกค้า (ชื่อหลัก/เบอร์/ที่อยู่/รหัส), 🔗 รวมชื่อลูกค้า (ชื่อที่เขียนหลายแบบ), ข้อมูลการบริการ (ยี่ห้อ/BTU/ตำแหน่งแอร์)

const HANDYMAN_TABS = { REGISTRY: 'ข้อมูลลูกค้า', ALIASES: '🔗 รวมชื่อลูกค้า', SERVICES: 'ข้อมูลการบริการ' }
const REGISTRY_LIMITS = { AC_LINES: 6, ALIASES: 8, ALIAS_LENGTH: 60, ADDRESS: 160, AC_TEXT: 400 }
const PHONE_IN_NAME_RE = /\s*0\d{1,2}[-\s]?\d{3}[-\s]?\d{4}/

function cleanCell_(v) {
  const s = String(v === null || v === undefined ? '' : v).replace(/\s+/g, ' ').trim()
  return /^[\s*\-–—_.'"?]*$/.test(s) ? '' : s  // "*" "-" ฯลฯ ที่ใส่ไว้ข้ามช่องบังคับ = ว่าง
}

// อ่านเฉพาะคอลัมน์ที่ขอ (ตามชื่อหัวตาราง) จึงไม่ดึงคอลัมน์เงินมาเลย และไม่พังถ้าลำดับคอลัมน์เปลี่ยน
function readColumnsByHeader_(sheet, wanted) {
  const lastRow = sheet.getLastRow()
  const lastCol = sheet.getLastColumn()
  if (lastRow < 2 || lastCol < 1) return []
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).replace(/\s+/g, ' ').trim() })
  const cols = {}
  wanted.forEach(function (name) {
    const i = headers.indexOf(name)
    if (i !== -1) cols[name] = i
  })
  const names = Object.keys(cols)
  if (!names.length) return []
  const data = {}
  names.forEach(function (name) { data[name] = sheet.getRange(2, cols[name] + 1, lastRow - 1, 1).getValues() })
  const rows = []
  for (let r = 0; r < lastRow - 1; r++) {
    const row = {}
    names.forEach(function (name) { row[name] = cleanCell_(data[name][r][0]) })
    rows.push(row)
  }
  return rows
}

// ชื่อลูกค้าในทะเบียนบางรายมีเบอร์ติดอยู่ ("คุณโอ 089-xxx-xxxx") แยกเบอร์ออกจากชื่อ
function splitPhoneFromName_(name) {
  const m = String(name || '').match(PHONE_IN_NAME_RE)
  return { name: String(name || '').replace(PHONE_IN_NAME_RE, '').replace(/\s+/g, ' ').trim(), phone: m ? m[0].replace(/\s+/g, '') : '' }
}

// ช่องเบอร์โทรในทะเบียนบางแถวมีชื่อคนติดอยู่ ("065-983-xxxx คุณอังคณา" / "คุณปอนด์ 082-790-xxxx")
// แยกเป็นเบอร์ (เบอร์แรก) + ชื่อผู้ติดต่อ ถ้าเหลือข้อความที่มีตัวเลข (เช่นเบอร์ที่สอง) ถือว่าไม่ใช่ชื่อคน
function splitPhoneCell_(text) {
  const raw = String(text || '')
  const m = raw.match(PHONE_RE)
  if (!m) return { phone: '', contact: '' }
  const rest = raw.replace(new RegExp(PHONE_RE.source, 'g'), ' ').replace(/^\s*(ติดต่อ|โทร|เบอร์)\s*[:：]?/, '').replace(/[:：,\/]/g, ' ').replace(/\s+/g, ' ').trim()
  return { phone: m[0].replace(/\s+/g, ''), contact: /\d/.test(rest) || rest.length > 60 ? '' : rest }
}

// คีย์แบบหลวม: ใช้จับคู่ชื่อในปฏิทินกับชื่อหลักในทะเบียน ตามกติกาเดียวกับตาราง "รวมชื่อลูกค้า" ของทีม
// "ชื่อเหมือนกัน ต่างแค่เว้นวรรค / คำว่าสาขา / คำต่อท้ายงาน" — ต้องตรงกับ looseKey ใน src/lib/customer-search.ts
function looseCustomerKey_(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/^\s*เสนอราคา\s*[-–—:]?\s*/, '')
    .replace(/^\s*pm\s+/, '')
    .replace(/[\[\]]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s*[-–—]\s*(wo[\w\-\/]*.*|ซ่อม.*|ล้าง.*|ตรวจ.*|ติดตั้ง.*)$/i, ' ')
    .replace(/เข้าได้เวลา.*$/, ' ')
    .replace(/สาขา/g, ' ')
    .replace(/['’`]/g, '')
    .replace(/\s+/g, '')
}

const LOOSE_KEY_MIN_LENGTH = 6  // สั้นกว่านี้ (เช่น "kfc") กว้างเกินไป ไม่ใช้จับคู่

// ข้อความในวงเล็บ: บางทีเป็นแค่หมายเหตุงาน/คำแปล (ตัดทิ้งได้) แต่บางทีคือตัวบอกสาขา เช่น "(BBT บางบัวทอง)" vs "(MTU เมืองทอง)"
// parenIdentityKey_ = เนื้อหาในวงเล็บที่ "เป็นตัวตน" (ไม่นับหมายเหตุงานอย่าง (ซ่อม) (รออะไหล่) (PM))
// ถ้าสองชื่อมีตัวตนในวงเล็บทั้งคู่และไม่เหมือนกัน = คนละสาขา ห้ามรวม — ต้องตรงกับ parenIdentityKey ใน src/lib/customer-search.ts
const PAREN_NOTE_RE = /^(ซ่อม|ล้าง|ตรวจ|ติดตั้ง|รออะไหล่|อะไหล่|pm)/
function parenIdentityKey_(name) {
  const parts = String(name || '').toLowerCase().match(/\([^)]*\)/g) || []
  return parts
    .map(function (p) { return p.slice(1, -1).replace(/['’`\s]/g, '') })
    .filter(function (p) { return p && !PAREN_NOTE_RE.test(p) })
    .join('')
}
function parenConflict_(a, b) {
  const ka = parenIdentityKey_(a)
  const kb = parenIdentityKey_(b)
  return ka !== '' && kb !== '' && ka !== kb
}

function formatAcLine_(brand, btu, place, count) {
  const size = btu ? (/btu/i.test(btu) ? btu : btu + ' BTU') : ''
  const head = [brand, size].filter(Boolean).join(' ')
  return '- ' + head + (place ? ' · ' + place : '') + (count > 1 ? ' (x' + count + ')' : '')
}

function cell_(row, name) {
  return cleanCell_(row[name])
}

// registryRows/aliasRows/serviceRows = แถวที่อ่านด้วย readColumnsByHeader_ → { byCode, nameToCode }
function buildRegistry_(registryRows, aliasRows, serviceRows) {
  const byCode = {}
  const nameToCode = {}
  const addName = function (name, code) {
    const key = normalizeCustomerKey_(name)
    if (key && code && !nameToCode[key]) nameToCode[key] = code
  }

  registryRows.forEach(function (r) {
    const code = cell_(r, 'รหัสลูกค้า')
    if (!code) return
    const base = splitPhoneFromName_(cell_(r, 'ชื่อลูกค้า'))
    const display = [base.name, cell_(r, 'สาขา')].filter(Boolean).join(' ') || splitPhoneFromName_(cell_(r, 'ชื่อลูกค้า+สาขา')).name || cell_(r, 'รายชื่อ')
    if (!display) return
    const cellPhone = splitPhoneCell_(cell_(r, 'เบอร์โทรศัพท์'))
    const phone = cellPhone.phone || base.phone
    const contact = cellPhone.phone ? cellPhone.contact : ''
    const rec = byCode[code]
    if (rec) {  // รหัสซ้ำ: เติมช่องที่ยังว่าง
      if (!rec.phone) { rec.phone = phone; rec.contactName = contact }
      if (!rec.address) rec.address = cell_(r, 'ที่อยู่').slice(0, REGISTRY_LIMITS.ADDRESS)
    } else {
      byCode[code] = {
        code: code, name: display, contactName: contact, phone: phone,
        address: cell_(r, 'ที่อยู่').slice(0, REGISTRY_LIMITS.ADDRESS), emphasis: '', acInfo: '',
        aliases: [], count: Number(cell_(r, 'จำนวนการใช้บริการ')) || 0, time: 0, source: 'registry'
      }
    }
    // ชื่อลูกค้าเปล่าๆ (เช่นแบรนด์ "KFC") ใช้เป็นชื่ออื่นได้เฉพาะแถวที่ไม่มีสาขา ไม่งั้นแบรนด์จะไปชี้ที่สาขาแรกที่เจอ
    const names = [display, cell_(r, 'รายชื่อ')]
    if (!cell_(r, 'สาขา')) names.push(cell_(r, 'ชื่อลูกค้า'), base.name)
    names.forEach(function (n) { addName(n, code) })
    const reg = byCode[code]
    if (cell_(r, 'รายชื่อ') && cell_(r, 'รายชื่อ') !== reg.name && reg.aliases.indexOf(cell_(r, 'รายชื่อ')) === -1) reg.aliases.push(cell_(r, 'รายชื่อ'))
  })

  aliasRows.forEach(function (r) {
    const reg = byCode[cell_(r, 'รหัสลูกค้า')]
    if (!reg) return
    ;[cell_(r, 'ชื่อที่พบ'), cell_(r, 'ชื่อหลัก')].forEach(function (n) {
      addName(n, reg.code)
      const clean = splitPhoneFromName_(n).name
      if (clean && clean !== reg.name && reg.aliases.indexOf(clean) === -1) reg.aliases.push(clean)
    })
  })

  // ข้อมูลแอร์: รวมยี่ห้อ/BTU/ตำแหน่งที่เคยเข้าทำของลูกค้าแต่ละราย (จับคู่จากชื่อลูกค้าในแต่ละงาน)
  const acByCode = {}
  serviceRows.forEach(function (r) {
    const code = nameToCode[normalizeCustomerKey_(cell_(r, 'ลูกค้า'))]
    if (!code || !byCode[code]) return
    const brand = cell_(r, 'ยี่ห้อ-รุ่น')
    const btu = cell_(r, 'BTU')
    if (!brand && !btu) return
    const place = cell_(r, 'สถานที่ที่ติดตั้ง')
    const key = [brand, btu, place].join('|')
    const bucket = acByCode[code] || (acByCode[code] = {})
    bucket[key] = bucket[key] || { brand: brand, btu: btu, place: place, count: 0 }
    bucket[key].count += 1
  })
  Object.keys(acByCode).forEach(function (code) {
    const items = Object.keys(acByCode[code]).map(function (k) { return acByCode[code][k] })
      .sort(function (a, b) { return b.count - a.count })
      .slice(0, REGISTRY_LIMITS.AC_LINES)
    byCode[code].acInfo = items.map(function (i) { return formatAcLine_(i.brand, i.btu, i.place, i.count) }).join('\n').slice(0, REGISTRY_LIMITS.AC_TEXT)
  })

  Object.keys(byCode).forEach(function (code) {
    byCode[code].aliases = byCode[code].aliases.slice(0, REGISTRY_LIMITS.ALIASES).map(function (a) { return a.slice(0, REGISTRY_LIMITS.ALIAS_LENGTH) })
  })
  // คีย์แบบหลวม → รหัสลูกค้า เฉพาะที่ตรงร้านเดียว (ถ้ากำกวมหลายร้านไม่รวม กันรวมผิดสาขา)
  const looseCodes = {}
  const addLoose = function (name, code) {
    const key = looseCustomerKey_(name)
    if (key.length < LOOSE_KEY_MIN_LENGTH) return
    const set = looseCodes[key] || (looseCodes[key] = {})
    set[code] = true
  }
  Object.keys(byCode).forEach(function (code) {
    addLoose(byCode[code].name, code)
    byCode[code].aliases.forEach(function (a) { addLoose(a, code) })
  })
  // เก็บรหัสทั้งหมดที่ตรงคีย์ ตอนจับคู่ค่อยคัดร้านที่วงเล็บขัดแย้งออก แล้วรวมเฉพาะเมื่อเหลือร้านเดียว
  const looseToCodes = {}
  Object.keys(looseCodes).forEach(function (key) { looseToCodes[key] = Object.keys(looseCodes[key]) })
  return { byCode: byCode, nameToCode: nameToCode, looseToCodes: looseToCodes }
}

// หารหัสลูกค้าจากชื่อด้วยคีย์แบบหลวม: คัดร้านที่วงเล็บบอกสาขาขัดแย้งออก แล้วต้องเหลือร้านเดียวเท่านั้น
function resolveRegistryByLooseKey_(registry, name) {
  const loose = looseCustomerKey_(name)
  if (loose.length < LOOSE_KEY_MIN_LENGTH) return undefined
  const compatible = (registry.looseToCodes[loose] || []).filter(function (code) {
    const reg = registry.byCode[code]
    return [reg.name].concat(reg.aliases).some(function (n) { return !parenConflict_(name, n) })
  })
  return compatible.length === 1 ? compatible[0] : undefined
}

function loadHandymanRegistry_(sheetId) {
  const ss = SpreadsheetApp.openById(sheetId)
  const read = function (tab, wanted) {
    const sheet = ss.getSheetByName(tab)
    return sheet ? readColumnsByHeader_(sheet, wanted) : []
  }
  return buildRegistry_(
    read(HANDYMAN_TABS.REGISTRY, ['รายชื่อ', 'ชื่อลูกค้า', 'สาขา', 'ชื่อลูกค้า+สาขา', 'เบอร์โทรศัพท์', 'ที่อยู่', 'จำนวนการใช้บริการ', 'รหัสลูกค้า']),
    read(HANDYMAN_TABS.ALIASES, ['ชื่อที่พบ', 'รหัสลูกค้า', 'ชื่อหลัก']),
    read(HANDYMAN_TABS.SERVICES, ['ลูกค้า', 'ยี่ห้อ-รุ่น', 'BTU', 'สถานที่ที่ติดตั้ง'])
  )
}

// รวมทะเบียน (ชื่อหลัก) เข้ากับข้อมูลจากปฏิทิน: ชื่อในปฏิทินที่ตรงกับทะเบียน/ชื่อที่เคยรวมไว้ → เติมข้อเน้นย้ำให้ลูกค้ารายนั้น
// ชื่อในปฏิทินที่ไม่ตรงกับทะเบียนเลยยังคงเป็นรายการแยก (source = calendar)
// ชื่อที่มีแต่ในปฏิทิน (ไม่อยู่ในทะเบียน) ที่คีย์แบบหลวมเหมือนกัน รวมเป็นรายการเดียว
// ชื่อที่มีนัดมากที่สุดเป็นชื่อหลัก (เท่ากันเลือกชื่อสั้นกว่า) ชื่ออื่นเก็บเป็น aliases
// กันรวมผิดสาขา: ชื่อที่วงเล็บบอกสาขาต่างกัน (เช่น (RAMA 2) vs (LADPRAO 101)) ไม่รวมกัน
// และชื่อที่ไม่มีวงเล็บจะรวมเข้ากลุ่มได้เฉพาะเมื่อมีกลุ่มที่เข้ากันได้กลุ่มเดียว
function groupUnlinkedCalendar_(entries) {
  const groupsByKey = {}
  const order = []
  const out = []
  entries.forEach(function (c) {
    const key = looseCustomerKey_(c.name)
    if (key.length < LOOSE_KEY_MIN_LENGTH) { out.push(c); return }
    const identity = parenIdentityKey_(c.name)
    const groups = groupsByKey[key] || (groupsByKey[key] = [])
    const compatible = groups.filter(function (g) { return !g.identity || !identity || g.identity === identity })
    const target = compatible.length === 1 || (compatible.length > 1 && identity) ? compatible[0] : undefined
    if (target) {
      target.members.push(c)
      if (!target.identity) target.identity = identity
    } else {
      const group = { identity: identity, members: [c] }
      groups.push(group)
      order.push(group)
    }
  })
  order.forEach(function (g) {
    const group = g.members.sort(function (a, b) { return (b.count - a.count) || (a.name.length - b.name.length) })
    const main = group[0]
    main.aliases = main.aliases || []
    group.slice(1).forEach(function (o) {
      main.count += o.count
      if (!main.phone && o.phone) { main.phone = o.phone; main.contactName = o.contactName }
      if (!main.address && o.address) main.address = o.address
      if (o.emphasis && (!main.emphasis || o.time > main.time)) main.emphasis = o.emphasis
      if (o.acInfo && (!main.acInfo || o.time > main.time)) main.acInfo = o.acInfo
      if (o.time > main.time) main.time = o.time
      if (main.aliases.length < REGISTRY_LIMITS.ALIASES && main.aliases.indexOf(o.name) === -1) main.aliases.push(o.name.slice(0, REGISTRY_LIMITS.ALIAS_LENGTH))
    })
    out.push(main)
  })
  return out
}

function mergeRegistryAndCalendar_(registry, calendarMap) {
  const calendarList = Object.keys(calendarMap).map(function (k) { return calendarMap[k] })
  if (!registry) {
    calendarList.forEach(function (c) { c.source = 'calendar' })
    return groupUnlinkedCalendar_(calendarList)
  }
  const out = []
  const unlinked = []
  calendarList.forEach(function (cal) {
    const code = registry.nameToCode[normalizeCustomerKey_(cal.name)] || resolveRegistryByLooseKey_(registry, cal.name)
    const reg = code && registry.byCode[code]
    if (!reg) { cal.source = 'calendar'; unlinked.push(cal); return }
    if (cal.emphasis && cal.time >= reg.time) { reg.emphasis = cal.emphasis; reg.time = cal.time }
    if (!reg.phone && cal.phone) { reg.phone = cal.phone; reg.contactName = cal.contactName }
    if (!reg.acInfo && cal.acInfo) reg.acInfo = cal.acInfo  // ทะเบียนมีข้อมูลแอร์ใช้ของทะเบียน ไม่มีค่อยใช้ของนัดเก่า
    if (!reg.address && cal.address) reg.address = cal.address.slice(0, REGISTRY_LIMITS.ADDRESS)
    if (cal.name !== reg.name && reg.aliases.length < REGISTRY_LIMITS.ALIASES && reg.aliases.indexOf(cal.name) === -1) reg.aliases.push(cal.name.slice(0, REGISTRY_LIMITS.ALIAS_LENGTH))
    reg.source = 'both'
  })
  groupUnlinkedCalendar_(unlinked).forEach(function (c) { out.push(c) })
  Object.keys(registry.byCode).forEach(function (code) { out.push(registry.byCode[code]) })
  return out
}

function customerMatches_(c, q, qDigits) {
  if (normalizeCustomerKey_(c.name).indexOf(q) !== -1) return true
  if ((c.aliases || []).some(function (a) { return normalizeCustomerKey_(a).indexOf(q) !== -1 })) return true
  return qDigits.length >= 3 && String(c.phone || '').replace(/\D/g, '').indexOf(qDigits) !== -1
}

function searchCustomerList_(list, query, limit) {
  const q = normalizeCustomerKey_(query)
  const qDigits = String(query || '').replace(/\D/g, '')
  if (q.length < 2) return []
  return list
    .filter(function (c) { return customerMatches_(c, q, qDigits) })
    .sort(function (a, b) {
      const as = normalizeCustomerKey_(a.name).indexOf(q) === 0 ? 0 : 1
      const bs = normalizeCustomerKey_(b.name).indexOf(q) === 0 ? 0 : 1
      return (as - bs) || ((b.count || 0) - (a.count || 0))
    })
    .slice(0, limit || 6)
    .map(function (c) {
      return {
        customerName: c.name, customerCode: c.code || '', contactName: c.contactName, phone: c.phone, address: c.address,
        emphasis: c.emphasis, acInfo: c.acInfo || '', aliases: c.aliases || [], jobCount: c.count || 0, source: c.source || 'calendar'
      }
    })
}

function writeCustomerIndexCache_(list) {
  const cache = CacheService.getScriptCache()
  const json = JSON.stringify(list)
  const chunks = Math.ceil(json.length / CUSTOMER_INDEX.CHUNK_SIZE)
  const entries = {}
  entries[CUSTOMER_INDEX.CACHE_KEY + '_n'] = String(chunks)
  for (let i = 0; i < chunks; i++) {
    entries[CUSTOMER_INDEX.CACHE_KEY + '_' + i] = json.slice(i * CUSTOMER_INDEX.CHUNK_SIZE, (i + 1) * CUSTOMER_INDEX.CHUNK_SIZE)
  }
  cache.putAll(entries, CUSTOMER_INDEX.TTL_SECONDS)
}

function readCustomerIndexCache_() {
  const cache = CacheService.getScriptCache()
  const n = Number(cache.get(CUSTOMER_INDEX.CACHE_KEY + '_n'))
  if (!n) return null
  const keys = []
  for (let i = 0; i < n; i++) keys.push(CUSTOMER_INDEX.CACHE_KEY + '_' + i)
  const parts = cache.getAll(keys)  // ดึงทุกชิ้นในครั้งเดียว (ดัชนีมีหลายชิ้นเมื่อรวมทะเบียนลูกค้า)
  let json = ''
  for (let i = 0; i < n; i++) {
    const part = parts[keys[i]]
    if (part === undefined || part === null) return null
    json += part
  }
  try { return JSON.parse(json) } catch (e) { return null }
}

// สร้างดัชนีลูกค้าจากนัดในปฏิทินทุกตัวที่เป็นเจ้าของ (รันจาก trigger รายชั่วโมง หรือรันเองได้)
function buildCustomerIndex() {
  const now = Date.now()
  const from = new Date(now - CUSTOMER_INDEX.DAYS_BACK * 86400000)
  const to = new Date(now + CUSTOMER_INDEX.DAYS_AHEAD * 86400000)
  const map = {}
  CalendarApp.getAllOwnedCalendars().forEach(function (cal) {
    const calName = cal.getName()
    const skip = CUSTOMER_INDEX.SKIP_CALENDARS.some(function (s) { return calName.indexOf(s) !== -1 })
    if (skip) return
    cal.getEvents(from, to).forEach(function (ev) {
      const rec = parseCalendarEvent_(ev.getTitle(), ev.getDescription(), ev.getLocation(), ev.getStartTime().getTime())
      mergeCustomer_(map, rec)
    })
  })
  let registry = null
  const sheetId = PropertiesService.getScriptProperties().getProperty('HANDYMAN_SHEET_ID')
  if (sheetId) {
    try {
      registry = loadHandymanRegistry_(sheetId)
    } catch (e) {
      Logger.log('Handyman registry not loaded (calendar only): ' + e.message)
    }
  }
  const list = mergeRegistryAndCalendar_(registry, map)
  writeCustomerIndexCache_(list)
  Logger.log('customer index built: ' + list.length + ' customers' + (registry ? ' (with Handyman registry)' : ' (calendar only)'))
  return list.length
}

// รันครั้งเดียวจาก Editor: สร้างดัชนีทันที และตั้งให้สร้างใหม่ทุกชั่วโมง
function installCustomerIndexTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'buildCustomerIndex') ScriptApp.deleteTrigger(t)
  })
  ScriptApp.newTrigger('buildCustomerIndex').timeBased().everyHours(1).create()
  return buildCustomerIndex()
}

// GET ?action=searchCustomers&q=...&token=... → JSON (เรียกจากเซิร์ฟเวอร์ Next.js เท่านั้น)
function handleCustomerSearch_(params) {
  const respond = function (obj) {
    return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON)
  }
  const expected = PropertiesService.getScriptProperties().getProperty('CUSTOMER_SEARCH_TOKEN')
  if (!expected || params.token !== expected) return respond({ success: false, error: 'Unauthorized' })

  const list = readCustomerIndexCache_()
  if (!list) return respond({ success: true, indexReady: false, results: [] })
  return respond({ success: true, indexReady: true, results: searchCustomerList_(list, params.q, 6) })
}

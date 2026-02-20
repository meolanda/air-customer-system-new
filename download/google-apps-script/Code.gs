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
  DRIVE_FOLDER_NAME: 'Aircon Service Images'
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

// Get all service requests
function getRequests() {
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
    logErrorToSheet('No data found, returning empty array');
    return [];
  }

  const headers = data[0];
  const requests = [];

  // Simple for loop (no forEach)
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[0]) {
      const obj = {};
      // Manual property assignment (no forEach)
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j]] = row[j] || '';
      }
      requests.push(obj);
    }
  }

  logErrorToSheet('SUCCESS: Returning ' + requests.length + ' requests');
  logErrorToSheet('DEBUG: requests = ' + JSON.stringify(requests));

  // Force serialization to avoid Google Apps Script serialization issues
  return JSON.parse(JSON.stringify(requests));
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

    const timestamp = new Date().toISOString() + ' (' + new Date().toLocaleString('th-TH') + ')';
    debugSheet.appendRow([timestamp, message]);
  } catch (e) {
    // Ignore logging errors
  }
}

// Add new request
function addRequest(request) {
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
  CacheService.getScriptCache().remove('requests');

  return { success: true, data: request }
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
      CacheService.getScriptCache().remove('requests');
      
      return { success: true, data: updated }
    }
  }
  
  return { success: false, error: 'Not found' }
}

// Delete request
function deleteRequest(id) {
  const sheet = getOrCreateSheet()
  const data = sheet.getDataRange().getValues()
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == id) {
      sheet.deleteRow(i + 1)
      // Clear cache
      CacheService.getScriptCache().remove('requests');
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
        name: data[i][1],
        department: data[i][2]
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
    sheet.appendRow(['id', 'name', 'department'])

    // Default users - 7 users as per actual setup
    const defaultUsers = [
      ['admin1', 'คุณเนย', 'admin'],
      ['admin2', 'คุณฟิล์ม', 'admin'],
      ['admin3', 'คุณตุ้ม', 'admin'],
      ['admin4', 'คุณดอย', 'admin'],
      ['admin5', 'คุณดอจ', 'admin'],
      ['quote1', 'คุณออมสิน', 'quotation'],
      ['procure1', 'คุณเผือก', 'procurement']
    ]

    defaultUsers.forEach(u => sheet.appendRow(u))

    // Style
    const range = sheet.getRange(1, 1, 1, 3)
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
    'status', 'appointmentDate', 'notes', 'imageUrl', 'history'
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

// ==================== SETUP FUNCTION ====================

// Run this once to setup
function setup() {
  getOrCreateSheet()
  getOrCreateDriveFolder()
  setupUsers()
  Logger.log('Setup complete!')
}

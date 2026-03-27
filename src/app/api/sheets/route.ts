import { google } from 'googleapis'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkRateLimit, rateLimitResponse } from '@/lib/api-middleware'
import { withRetry } from '@/lib/retry'

const RequestSchema = z.object({
  id: z.string().min(1),
  requestNo: z.string().min(1),
  createdAt: z.string(),
  channel: z.enum(['LINE', 'โทร', 'Walk-in', 'Facebook', 'อื่นๆ']),
  customerName: z.string().min(1).max(200),
  contactName: z.string().max(200).optional(),
  phone: z.string().max(20),
  address: z.string().max(500),
  serviceType: z.string().max(100),
  description: z.string().max(2000),
  priority: z.enum(['normal', 'urgent', 'emergency']),
  status: z.enum(['new', 'queue', 'waiting_quote', 'checking_parts', 'order_parts', 'send_quote', 'waiting_response', 'completed', 'cancelled']),
  appointmentDate: z.string(),
  notes: z.string().max(500),
  imageUrl: z.string(),
  history: z.array(z.object({ status: z.string(), date: z.string(), by: z.string() })),
  calendarEventId: z.string().optional(),
  calendarEventUrl: z.string().optional(),
})

// Type definitions
interface ServiceRequest {
  id: string
  requestNo: string
  createdAt: string
  channel: 'LINE' | 'โทร' | 'Walk-in' | 'Facebook' | 'อื่นๆ'
  customerName: string
  contactName?: string
  phone: string
  address: string
  serviceType: string
  description: string
  priority: 'normal' | 'urgent' | 'emergency'
  status: string
  appointmentDate: string
  notes: string
  imageUrl: string
  history: { status: string; date: string; by: string }[]
  calendarEventId?: string
  calendarEventUrl?: string
}

// Initialize Google Sheets client and detect actual sheet tab name
async function getGoogleSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env['GOOGLE_SERVICE_ACCOUNT_EMAIL'],
      private_key: process.env['GOOGLE_PRIVATE_KEY']?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })

  return google.sheets({ version: 'v4', auth })
}

// Get the actual first sheet tab name and sheetId
async function getSheetMeta(sheets: ReturnType<typeof google.sheets>, spreadsheetId: string): Promise<{ tabName: string; sheetId: number }> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  const firstSheet = meta.data.sheets?.[0]
  const configuredName = process.env['GOOGLE_SHEETS_TAB_NAME']
  const tabName = configuredName || firstSheet?.properties?.title || 'Sheet1'
  const sheetId = firstSheet?.properties?.sheetId ?? 0
  return { tabName, sheetId }
}

async function getSheetTabName(sheets: ReturnType<typeof google.sheets>, spreadsheetId: string): Promise<string> {
  const { tabName } = await getSheetMeta(sheets, spreadsheetId)
  return tabName
}

// Convert array to ServiceRequest object
function arrayToRequest(row: string[], headers: string[]): ServiceRequest {
  const obj: Record<string, string> = {}
  headers.forEach((header, index) => {
    obj[header] = row[index] || ''
  })

  let history: { status: string; date: string; by: string }[] = []
  try {
    if (obj['history']) {
      history = JSON.parse(obj['history'])
    }
  } catch (e) {
    history = []
  }

  return {
    id: obj['id'] || '',
    requestNo: obj['requestNo'] || '',
    createdAt: obj['createdAt'] || '',
    channel: obj['channel'] as ServiceRequest['channel'] || 'LINE',
    customerName: obj['customerName'] || '',
    contactName: obj['contactName'] || '',
    phone: obj['phone'] || '',
    address: obj['address'] || '',
    serviceType: obj['serviceType'] || '',
    description: obj['description'] || '',
    priority: obj['priority'] as ServiceRequest['priority'] || 'normal',
    status: obj['status'] || 'new',
    appointmentDate: obj['appointmentDate'] || '',
    notes: obj['notes'] || '',
    imageUrl: obj['imageUrl'] || '',
    history,
    calendarEventId: obj['calendarEventId'] || '',
    calendarEventUrl: obj['calendarEventUrl'] || '',
  }
}

// Convert ServiceRequest object to array
function requestToArray(request: ServiceRequest): string[] {
  return [
    request.id,
    request.requestNo,
    request.createdAt,
    request.channel,
    request.customerName,
    request.contactName || '',
    request.phone,
    request.address,
    request.serviceType,
    request.description,
    request.priority,
    request.status,
    request.appointmentDate,
    request.notes,
    request.imageUrl,
    JSON.stringify(request.history),
    request.calendarEventId || '',
    request.calendarEventUrl || '',
  ]
}

// GET - Fetch all data from Google Sheets
export async function GET(request: NextRequest) {
  if (!checkRateLimit(request)) return rateLimitResponse()
  try {
    const sheets = await getGoogleSheetsClient()
    const spreadsheetId = process.env['GOOGLE_SHEETS_ID']

    if (!spreadsheetId) {
      return NextResponse.json(
        { error: 'GOOGLE_SHEETS_ID not configured' },
        { status: 500 }
      )
    }

    const tabName = await getSheetTabName(sheets, spreadsheetId)

    const response = await withRetry(() => sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tabName}!A2:R`,
    }))

    const headerResponse = await withRetry(() => sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tabName}!A1:R1`,
    }))

    const headers = headerResponse.data.values?.[0] || [
      'id', 'requestNo', 'createdAt', 'channel', 'customerName', 'contactName',
      'phone', 'address', 'serviceType', 'description', 'priority',
      'status', 'appointmentDate', 'notes', 'imageUrl', 'history',
      'calendarEventId', 'calendarEventUrl'
    ]

    const rows = response.data.values || []
    const requests: ServiceRequest[] = rows.map(row => arrayToRequest(row, headers))

    // Server-Side Data Filtering
    const now = new Date()
    const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30))

    const filteredRequests = requests.filter(req => {
      // Condition 1: Keep active jobs (not completed and not cancelled)
      const isActive = req.status !== 'completed' && req.status !== 'cancelled'

      // Condition 2: If completed/cancelled, must be within the last 30 days
      const reqDate = new Date(req.createdAt)
      const isRecent = reqDate >= thirtyDaysAgo

      return isActive || isRecent
    })

    return NextResponse.json({ data: filteredRequests })
  } catch (error: unknown) {
    console.error('Error fetching from Google Sheets:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Failed to fetch data', details: errorMessage },
      { status: 500 }
    )
  }
}

// POST - Add new data to Google Sheets
export async function POST(request: NextRequest) {
  if (!checkRateLimit(request)) return rateLimitResponse()
  try {
    const body = await request.json()
    const validated = RequestSchema.safeParse(body)
    if (!validated.success) {
      return NextResponse.json({ error: 'Invalid request data', details: validated.error.flatten() }, { status: 400 })
    }
    const sheets = await getGoogleSheetsClient()
    const spreadsheetId = process.env['GOOGLE_SHEETS_ID']

    if (!spreadsheetId) {
      return NextResponse.json(
        { error: 'GOOGLE_SHEETS_ID not configured' },
        { status: 500 }
      )
    }

    const tabName = await getSheetTabName(sheets, spreadsheetId)

    const newRequest: ServiceRequest = {
      id: body.id || Date.now().toString(),
      requestNo: body.requestNo || '',
      createdAt: body.createdAt || new Date().toISOString(),
      channel: body.channel || 'LINE',
      customerName: body.customerName || '',
      phone: body.phone || '',
      address: body.address || '',
      serviceType: body.serviceType || '',
      description: body.description || '',
      priority: body.priority || 'normal',
      status: body.status || 'new',
      appointmentDate: body.appointmentDate || '',
      notes: body.notes || '',
      imageUrl: body.imageUrl || '',
      history: body.history || [{ status: 'new', date: new Date().toISOString(), by: 'System' }],
      calendarEventId: body.calendarEventId || '',
      calendarEventUrl: body.calendarEventUrl || '',
    }

    const row = requestToArray(newRequest)

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tabName}!A:R`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [row],
      },
    })

    return NextResponse.json({ success: true, data: newRequest })
  } catch (error: unknown) {
    console.error('Error adding to Google Sheets:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Failed to add data', details: errorMessage },
      { status: 500 }
    )
  }
}

// PUT - Update data in Google Sheets
export async function PUT(request: NextRequest) {
  if (!checkRateLimit(request)) return rateLimitResponse()
  try {
    const body = await request.json()
    const { id, ...updateData } = body
    const sheets = await getGoogleSheetsClient()
    const spreadsheetId = process.env['GOOGLE_SHEETS_ID']

    if (!spreadsheetId) {
      return NextResponse.json(
        { error: 'GOOGLE_SHEETS_ID not configured' },
        { status: 500 }
      )
    }

    const tabName = await getSheetTabName(sheets, spreadsheetId)

    // Find the row with matching id
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tabName}!A:A`,
    })

    const rows = response.data.values || []
    let rowIndex = -1

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (row && row[0] === id) {
        rowIndex = i + 1 // 1-indexed for Google Sheets
        break
      }
    }

    if (rowIndex === -1) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }

    // Get existing data
    const existingResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tabName}!A${rowIndex}:R${rowIndex}`,
    })

    const existingRow = existingResponse.data.values?.[0] || []
    const headers = ['id', 'requestNo', 'createdAt', 'channel', 'customerName', 'contactName',
      'phone', 'address', 'serviceType', 'description', 'priority',
      'status', 'appointmentDate', 'notes', 'imageUrl', 'history',
      'calendarEventId', 'calendarEventUrl']

    const existingRequest = arrayToRequest(existingRow, headers)

    // Merge with update data
    const updatedRequest: ServiceRequest = {
      ...existingRequest,
      ...updateData,
      id: existingRequest.id, // Don't allow id change
    }

    const updatedRow = requestToArray(updatedRequest)

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tabName}!A${rowIndex}:R${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [updatedRow],
      },
    })

    return NextResponse.json({ success: true, data: updatedRequest })
  } catch (error: unknown) {
    console.error('Error updating Google Sheets:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Failed to update data', details: errorMessage },
      { status: 500 }
    )
  }
}

// DELETE - Remove data from Google Sheets
export async function DELETE(request: NextRequest) {
  if (!checkRateLimit(request)) return rateLimitResponse()
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 })
    }

    const sheets = await getGoogleSheetsClient()
    const spreadsheetId = process.env['GOOGLE_SHEETS_ID']

    if (!spreadsheetId) {
      return NextResponse.json(
        { error: 'GOOGLE_SHEETS_ID not configured' },
        { status: 500 }
      )
    }

    const { tabName, sheetId } = await getSheetMeta(sheets, spreadsheetId)

    // Find the row with matching id
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tabName}!A:A`,
    })

    const rows = response.data.values || []
    let rowIndex = -1

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (row && row[0] === id) {
        rowIndex = i // 0-indexed for batchUpdate
        break
      }
    }

    if (rowIndex === -1) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }

    // Actually delete the row (not just clear content)
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: rowIndex,
              endIndex: rowIndex + 1
            }
          }
        }]
      }
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Error deleting from Google Sheets:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Failed to delete data', details: errorMessage },
      { status: 500 }
    )
  }
}


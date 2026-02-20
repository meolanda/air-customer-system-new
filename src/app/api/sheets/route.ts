import { google } from 'googleapis'
import { NextRequest, NextResponse } from 'next/server'

// Type definitions
interface ServiceRequest {
  id: string
  requestNo: string
  createdAt: string
  channel: 'LINE' | 'โทร' | 'Walk-in' | 'Facebook' | 'อื่นๆ'
  customerName: string
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
}

// Initialize Google Sheets client
async function getGoogleSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })

  return google.sheets({ version: 'v4', auth })
}

// Convert array to ServiceRequest object
function arrayToRequest(row: string[], headers: string[]): ServiceRequest {
  const obj: Record<string, string> = {}
  headers.forEach((header, index) => {
    obj[header] = row[index] || ''
  })

  let history: { status: string; date: string; by: string }[] = []
  try {
    if (obj.history) {
      history = JSON.parse(obj.history)
    }
  } catch (e) {
    history = []
  }

  return {
    id: obj.id || '',
    requestNo: obj.requestNo || '',
    createdAt: obj.createdAt || '',
    channel: obj.channel as ServiceRequest['channel'] || 'LINE',
    customerName: obj.customerName || '',
    phone: obj.phone || '',
    address: obj.address || '',
    serviceType: obj.serviceType || '',
    description: obj.description || '',
    priority: obj.priority as ServiceRequest['priority'] || 'normal',
    status: obj.status || 'new',
    appointmentDate: obj.appointmentDate || '',
    notes: obj.notes || '',
    imageUrl: obj.imageUrl || '',
    history,
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
  ]
}

// GET - Fetch all data from Google Sheets
export async function GET() {
  try {
    const sheets = await getGoogleSheetsClient()
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID

    if (!spreadsheetId) {
      return NextResponse.json(
        { error: 'GOOGLE_SHEETS_ID not configured' },
        { status: 500 }
      )
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A2:O', // Skip header row
    })

    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A1:O1',
    })

    const headers = headerResponse.data.values?.[0] || [
      'id', 'requestNo', 'createdAt', 'channel', 'customerName',
      'phone', 'address', 'serviceType', 'description', 'priority',
      'status', 'appointmentDate', 'notes', 'imageUrl', 'history'
    ]

    const rows = response.data.values || []
    const requests: ServiceRequest[] = rows.map(row => arrayToRequest(row, headers))

    return NextResponse.json({ data: requests })
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
  try {
    const body = await request.json()
    const sheets = await getGoogleSheetsClient()
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID

    if (!spreadsheetId) {
      return NextResponse.json(
        { error: 'GOOGLE_SHEETS_ID not configured' },
        { status: 500 }
      )
    }

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
    }

    const row = requestToArray(newRequest)

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Sheet1!A:O',
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
  try {
    const body = await request.json()
    const { id, ...updateData } = body
    const sheets = await getGoogleSheetsClient()
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID

    if (!spreadsheetId) {
      return NextResponse.json(
        { error: 'GOOGLE_SHEETS_ID not configured' },
        { status: 500 }
      )
    }

    // Find the row with matching id
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A:A',
    })

    const rows = response.data.values || []
    let rowIndex = -1

    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === id) {
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
      range: `Sheet1!A${rowIndex}:O${rowIndex}`,
    })

    const existingRow = existingResponse.data.values?.[0] || []
    const headers = ['id', 'requestNo', 'createdAt', 'channel', 'customerName',
      'phone', 'address', 'serviceType', 'description', 'priority',
      'status', 'appointmentDate', 'notes', 'imageUrl', 'history']

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
      range: `Sheet1!A${rowIndex}:O${rowIndex}`,
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
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 })
    }

    const sheets = await getGoogleSheetsClient()
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID

    if (!spreadsheetId) {
      return NextResponse.json(
        { error: 'GOOGLE_SHEETS_ID not configured' },
        { status: 500 }
      )
    }

    // Find the row with matching id
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A:A',
    })

    const rows = response.data.values || []
    let rowIndex = -1

    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === id) {
        rowIndex = i + 1 // 1-indexed for Google Sheets
        break
      }
    }

    if (rowIndex === -1) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }

    // Delete the row by clearing it (or we can use batchUpdate to actually remove the row)
    // For simplicity, we'll clear the row content
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `Sheet1!A${rowIndex}:O${rowIndex}`,
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

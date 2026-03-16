import { google } from 'googleapis'
import { NextResponse } from 'next/server'

export async function GET() {
  const results: Record<string, unknown> = {}

  // Step 1: Check env vars
  const email = process.env['GOOGLE_SERVICE_ACCOUNT_EMAIL']
  const key = process.env['GOOGLE_PRIVATE_KEY']
  const sheetId = process.env['GOOGLE_SHEETS_ID']

  results['env'] = {
    GOOGLE_SERVICE_ACCOUNT_EMAIL: email ? `✅ set (${email})` : '❌ missing',
    GOOGLE_PRIVATE_KEY: key
      ? `✅ set (length: ${key.length}, starts: ${key.slice(0, 30)}...)`
      : '❌ missing',
    GOOGLE_SHEETS_ID: sheetId ? `✅ set (${sheetId})` : '❌ missing',
  }

  if (!email || !key || !sheetId) {
    return NextResponse.json({ ...results, status: 'FAILED: missing env vars' })
  }

  // Step 2: Try auth
  try {
    const processedKey = key.replace(/\\n/g, '\n')
    results['key_format'] = {
      has_begin: processedKey.includes('-----BEGIN'),
      has_end: processedKey.includes('-----END'),
      newline_count: (processedKey.match(/\n/g) || []).length,
    }

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: email,
        private_key: processedKey,
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })

    const sheets = google.sheets({ version: 'v4', auth })

    // Step 3: Try read sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'Sheet1!A1:C3',
    })

    results['sheets_read'] = {
      status: '✅ SUCCESS',
      rows_found: response.data.values?.length ?? 0,
      sample: response.data.values?.slice(0, 2),
    }

    return NextResponse.json({ ...results, status: 'OK' })
  } catch (error: unknown) {
    const err = error as { message?: string; code?: number; errors?: unknown }
    results['error'] = {
      message: err?.message,
      code: err?.code,
      details: err?.errors,
    }
    return NextResponse.json({ ...results, status: 'FAILED' }, { status: 500 })
  }
}

import { google } from 'googleapis'
import { NextResponse } from 'next/server'
import { ref, set } from 'firebase/database'
import { db } from '@/lib/firebase'

export async function GET() {
    try {
        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: process.env['GOOGLE_SERVICE_ACCOUNT_EMAIL'],
                private_key: process.env['GOOGLE_PRIVATE_KEY']?.replace(/\\n/g, '\n'),
            },
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        })

        const sheets = google.sheets({ version: 'v4', auth })
        const spreadsheetId = process.env['GOOGLE_SHEETS_ID']

        if (!spreadsheetId) {
            return NextResponse.json({ error: 'GOOGLE_SHEETS_ID not configured' }, { status: 500 })
        }

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'Sheet1!A:Q',
        })

        const rows = response.data.values || []

        // First row is headers
        if (!rows || rows.length <= 1) {
            return NextResponse.json({ success: true, message: 'No data to import' })
        }

        const headers = rows[0]
        if (!headers) {
            return NextResponse.json({ error: 'No headers found' }, { status: 500 })
        }

        let importedCount = 0

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i]
            if (!row || !row[0]) continue // skip empty rows

            const obj: Record<string, any> = {}
            headers.forEach((header, index) => {
                obj[header] = row[index] || ''
            })

            let history = []
            try {
                if (obj['history']) history = JSON.parse(obj['history'])
            } catch (e) {
                history = []
            }

            const requestData = {
                id: obj['id'] || Date.now().toString(),
                requestNo: obj['requestNo'] || '',
                createdAt: obj['createdAt'] || '',
                channel: obj['channel'] || 'LINE',
                customerName: obj['customerName'] || '',
                phone: obj['phone'] || '',
                address: obj['address'] || '',
                serviceType: obj['serviceType'] || '',
                description: obj['description'] || '',
                priority: obj['priority'] || 'normal',
                status: obj['status'] || 'new',
                appointmentDate: obj['appointmentDate'] || '',
                notes: obj['notes'] || '',
                imageUrl: obj['imageUrl'] || '',
                history,
                calendarEventId: obj['calendarEventId'] || '',
                calendarEventUrl: obj['calendarEventUrl'] || '',
            }

            // Save mapped request to Firebase
            await set(ref(db, `serviceRequests/${requestData.id}`), requestData)
            importedCount++
        }

        return NextResponse.json({ success: true, count: importedCount })
    } catch (error: unknown) {
        console.error('Import error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return NextResponse.json(
            { error: 'Failed to import data', details: errorMessage },
            { status: 500 }
        )
    }
}

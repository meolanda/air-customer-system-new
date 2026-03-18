import { google } from 'googleapis'
import { NextRequest, NextResponse } from 'next/server'

// Initialize Google Calendar client
async function getGoogleCalendarClient() {
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env['GOOGLE_SERVICE_ACCOUNT_EMAIL'],
            private_key: process.env['GOOGLE_PRIVATE_KEY']?.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar'],
    })

    return google.calendar({ version: 'v3', auth })
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { requestNo, customerName, phone, address, serviceType, description, appointmentDate } = body

        const calendar = await getGoogleCalendarClient()
        const calendarId = process.env['GOOGLE_CALENDAR_ID']

        if (!calendarId) {
            return NextResponse.json(
                { error: 'GOOGLE_CALENDAR_ID not configured' },
                { status: 500 }
            )
        }

        if (!appointmentDate) {
            return NextResponse.json({ error: 'appointmentDate is required' }, { status: 400 })
        }

        // Prepare start and end time (Bangkok timezone UTC+7)
        let startDate: Date
        const hasTimezone = appointmentDate.includes('+') || appointmentDate.endsWith('Z')

        if (hasTimezone) {
            // Already has timezone info → parse directly
            startDate = new Date(appointmentDate)
        } else if (appointmentDate.length <= 10) {
            // Date only (YYYY-MM-DD) → default 09:00 Bangkok time
            startDate = new Date(`${appointmentDate}T09:00:00+07:00`)
        } else {
            // datetime-local format "2026-03-18T18:00" → treat as Bangkok time
            startDate = new Date(`${appointmentDate}+07:00`)
        }

        const endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000) // +2 hours

        // Prepare Event details
        const eventSummary = `[รอจัดช่าง] ${customerName} - ${serviceType}`
        let eventDescription = `เลขที่งาน: ${requestNo}\nลูกค้า: ${customerName}\nเบอร์โทร: ${phone}`

        if (address) {
            eventDescription += `\nสถานที่: ${address}`
        }
        if (description) {
            eventDescription += `\nอาการ/รายละเอียด: ${description}`
        }
        eventDescription += `\n\n**กรุณาเปลี่ยนชื่อหัวข้อเพื่อระบุตัวช่างที่รับผิดชอบ**`

        const event = {
            summary: eventSummary,
            location: address || '',
            description: eventDescription,
            start: {
                dateTime: startDate.toISOString(),
                timeZone: 'Asia/Bangkok',
            },
            end: {
                dateTime: endDate.toISOString(),
                timeZone: 'Asia/Bangkok',
            },
            colorId: '5' // Yellow color for pending
        }

        const response = await calendar.events.insert({
            calendarId: calendarId,
            requestBody: event,
        })

        return NextResponse.json({ success: true, data: { eventId: response.data.id, eventUrl: response.data.htmlLink } })
    } catch (error: any) {
        console.error('Error creating Google Calendar event:', error)
        return NextResponse.json(
            { error: 'Failed to create calendar event', details: error.message },
            { status: 500 }
        )
    }
}

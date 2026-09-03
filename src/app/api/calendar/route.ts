import { google } from 'googleapis'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkRateLimit, rateLimitResponse } from '@/lib/api-middleware'

const CalendarSchema = z.object({
  requestNo: z.string().min(1),
  customerName: z.string().min(1).max(200),
  phone: z.string().max(100),           // เพิ่มจาก 20 → รองรับหลายเบอร์ต่อกัน
  address: z.string().max(1000).optional(), // เพิ่มจาก 500 → ที่อยู่ยาว
  serviceType: z.string().max(100),
  description: z.string().max(10000).optional(), // เพิ่มจาก 2000 → รายละเอียดใบเสนอราคา
  appointmentDate: z.string().min(1),
  appointmentEndDate: z.string().optional(),
  isAllDay: z.boolean().optional(),
  eventId: z.string().optional(),
})

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

// Parse an appointment date string (date-only, datetime-local, or with timezone) as Bangkok time
function parseAppointmentDate(value: string, defaultHour: string): Date {
    const hasTimezone = value.includes('+') || value.endsWith('Z')
    if (hasTimezone) return new Date(value)
    if (value.length <= 10) return new Date(`${value}T${defaultHour}:00:00+07:00`)
    return new Date(`${value}+07:00`)
}

// Build the start/end of the calendar event from appointmentDate/appointmentEndDate/isAllDay
function buildEventTimes(appointmentDate: string, appointmentEndDate: string | undefined, isAllDay: boolean | undefined) {
    const startDate = parseAppointmentDate(appointmentDate, '09')
    const endDate = appointmentEndDate ? parseAppointmentDate(appointmentEndDate, '17') : new Date(startDate.getTime() + 2 * 60 * 60 * 1000)

    if (isAllDay) {
        // Google Calendar all-day events use date-only values with an EXCLUSIVE end date
        const toDateOnly = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }) // YYYY-MM-DD
        const exclusiveEnd = new Date(endDate.getTime() + 24 * 60 * 60 * 1000)
        return {
            start: { date: toDateOnly(startDate) },
            end: { date: toDateOnly(exclusiveEnd) },
        }
    }

    return {
        start: { dateTime: startDate.toISOString(), timeZone: 'Asia/Bangkok' },
        end: { dateTime: endDate.toISOString(), timeZone: 'Asia/Bangkok' },
    }
}

export async function POST(request: NextRequest) {
    if (!checkRateLimit(request)) return rateLimitResponse()
    try {
        const body = await request.json()
        const validated = CalendarSchema.safeParse(body)
        if (!validated.success) {
          return NextResponse.json({ error: 'Invalid request data' }, { status: 400 })
        }
        const { requestNo, customerName, phone, address, serviceType, description, appointmentDate, appointmentEndDate, isAllDay } = validated.data

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

        const { start, end } = buildEventTimes(appointmentDate, appointmentEndDate, isAllDay)

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
            start,
            end,
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

// PUT - Update existing event, if deleted → create new one
export async function PUT(request: NextRequest) {
    try {
        const body = await request.json()
        const { eventId, requestNo, customerName, phone, address, serviceType, description, appointmentDate, appointmentEndDate, isAllDay } = body

        const calendar = await getGoogleCalendarClient()
        const calendarId = process.env['GOOGLE_CALENDAR_ID']

        if (!calendarId) {
            return NextResponse.json({ error: 'GOOGLE_CALENDAR_ID not configured' }, { status: 500 })
        }

        if (!appointmentDate) {
            return NextResponse.json({ error: 'appointmentDate is required' }, { status: 400 })
        }

        const { start, end } = buildEventTimes(appointmentDate, appointmentEndDate, isAllDay)

        const eventSummary = `[รอจัดช่าง] ${customerName} - ${serviceType}`
        let eventDescription = `เลขที่งาน: ${requestNo}\nลูกค้า: ${customerName}\nเบอร์โทร: ${phone}`
        if (address) eventDescription += `\nสถานที่: ${address}`
        if (description) eventDescription += `\nอาการ/รายละเอียด: ${description}`
        eventDescription += `\n\n**กรุณาเปลี่ยนชื่อหัวข้อเพื่อระบุตัวช่างที่รับผิดชอบ**`

        const event = {
            summary: eventSummary,
            location: address || '',
            description: eventDescription,
            start,
            end,
            colorId: '5',
        }

        // Try update first, if event was deleted → create new one
        if (eventId) {
            try {
                const response = await calendar.events.update({
                    calendarId,
                    eventId,
                    requestBody: event,
                })
                return NextResponse.json({ success: true, data: { eventId: response.data.id, eventUrl: response.data.htmlLink } })
            } catch (updateError: any) {
                // Event not found (deleted) → fall through to create new
                if (updateError.code !== 404 && updateError.status !== 404) throw updateError
            }
        }

        // Create new event (either no eventId or old one was deleted)
        const response = await calendar.events.insert({ calendarId, requestBody: event })
        return NextResponse.json({ success: true, data: { eventId: response.data.id, eventUrl: response.data.htmlLink } })

    } catch (error: any) {
        console.error('Error updating Google Calendar event:', error)
        return NextResponse.json({ error: 'Failed to update calendar event', details: error.message }, { status: 500 })
    }
}

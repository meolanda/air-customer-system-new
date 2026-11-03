import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, rateLimitResponse } from '@/lib/api-middleware'

// ค้นลูกค้าจากนัดเก่าในปฏิทิน ผ่าน Google Apps Script (action=searchCustomers)
// ต้องล็อกอินแล้ว (proxy.ts ตรวจ session) และ token ถูกเก็บฝั่งเซิร์ฟเวอร์เท่านั้น
export async function GET(request: NextRequest) {
    if (!checkRateLimit(request)) return rateLimitResponse()

    const q = request.nextUrl.searchParams.get('q')?.trim() ?? ''
    if (q.length < 2) return NextResponse.json({ success: true, results: [] })

    const gasUrl = process.env['GAS_CUSTOMER_URL']
    const token = process.env['GAS_CUSTOMER_TOKEN']
    if (!gasUrl || !token) {
        return NextResponse.json({ success: true, configured: false, results: [] })
    }

    try {
        const target = new URL(gasUrl)
        target.searchParams.set('action', 'searchCustomers')
        target.searchParams.set('q', q)
        target.searchParams.set('token', token)

        const response = await fetch(target, { signal: AbortSignal.timeout(8000), cache: 'no-store' })
        const data = await response.json()
        if (!data.success) {
            return NextResponse.json({ success: false, error: 'Calendar customer search failed' }, { status: 502 })
        }
        return NextResponse.json({ success: true, indexReady: data.indexReady, results: data.results })
    } catch (error: any) {
        console.error('Calendar customer search error:', error.message)
        return NextResponse.json({ success: false, error: 'Calendar customer search unavailable' }, { status: 502 })
    }
}

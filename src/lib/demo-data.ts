// ข้อมูลตัวอย่างสำหรับทดสอบหน้าจอในเครื่อง (dev เท่านั้น — เปิดด้วย ?demo ต่อท้าย URL)
// ไม่มีข้อมูลลูกค้าจริง
const STATUSES = ['new', 'queue', 'waiting_quote', 'checking_parts', 'send_quote', 'waiting_response', 'completed', 'cancelled']
const SERVICES = ['ล้างแอร์', 'ซ่อมแอร์', 'ติดตั้งแอร์', 'ตรวจเช็ค']
const CHANNELS = ['LINE', 'โทร', 'Walk-in', 'Facebook', 'อื่นๆ']

export function demoRequests(count = 40): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, i) => {
    const status = STATUSES[i % STATUSES.length]!
    const created = new Date(Date.now() - i * 3_600_000 * 7).toISOString()
    return {
      id: `demo-${i}`,
      requestNo: `REQ-20260930-${String(i + 1).padStart(3, '0')}`,
      createdAt: created,
      channel: CHANNELS[i % CHANNELS.length],
      customerName: i % 3 === 0 ? `ร้านตัวอย่าง สาขาสยามพารากอน ${i + 1}` : `ลูกค้าตัวอย่าง ${i + 1}`,
      contactName: i % 2 === 0 ? 'คุณตัวอย่าง' : '',
      phone: '081-234-5678',
      address: 'ที่อยู่ตัวอย่าง ถนนสุขุมวิท กรุงเทพฯ',
      serviceType: SERVICES[i % SERVICES.length],
      description: i % 2 === 0 ? 'ใบแจ้งซ่อมตัวอย่าง แอร์มีอาการน้ำรั่วไหลจากถาดรองน้ำ ต้องการล้างและตรวจเช็ค' : '',
      priority: i % 7 === 0 ? 'urgent' : i % 11 === 0 ? 'emergency' : 'normal',
      status,
      notes: '',
      imageUrl: '',
      imageUrls: [],
      pdfUrl: '',
      pdfFileName: '',
      attachments: [],
      history: [{ status: 'new', date: created, by: 'demo' }],
    }
  })
}

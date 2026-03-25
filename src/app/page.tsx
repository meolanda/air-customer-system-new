'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { ref, onValue, set, update, remove } from 'firebase/database'
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../lib/firebase'
// Types
type Status = 'new' | 'queue' | 'waiting_quote' | 'checking_parts' | 'order_parts' | 'send_quote' | 'waiting_response' | 'completed' | 'cancelled'

interface User {
  id: string
  name: string
}

interface ServiceRequest {
  id: string
  requestNo: string
  createdAt: string
  channel: 'LINE' | 'โทร' | 'Walk-in' | 'Facebook' | 'อื่นๆ'
  customerName: string   // ชื่อร้าน/สาขา
  contactName?: string   // ผู้ติดต่อ (optional)
  phone: string
  address: string
  serviceType: string
  description: string
  priority: 'normal' | 'urgent' | 'emergency'
  status: Status
  appointmentDate: string
  appointmentEndDate?: string
  isAllDay?: boolean
  notes: string
  imageUrl: string
  pdfUrl?: string
  pdfFileName?: string
  history: { status: Status; date: string; by: string }[]
  calendarEventId?: string
  calendarEventUrl?: string
}

// Real employee list (name only, no department)
const USERS: User[] = [
  { id: 'u1', name: 'คุณเนย' },
  { id: 'u2', name: 'คุณฟิล์ม' },
  { id: 'u3', name: 'คุณตุ้ม' },
  { id: 'u4', name: 'คุณดอย' },
  { id: 'u5', name: 'คุณดอจ' },
  { id: 'u6', name: 'คุณออมสิน' },
  { id: 'u7', name: 'คุณเผือก' }
]

// Status config
const STATUS_CONFIG: Record<Status, { label: string; icon: string; color: string }> = {
  new: { label: 'รับเรื่องใหม่', icon: '📥', color: 'bg-slate-500' },
  queue: { label: 'จองคิว / นัดหมาย', icon: '📋', color: 'bg-yellow-500' },
  waiting_quote: { label: 'ขอใบเสนอราคา', icon: '💰', color: 'bg-orange-500' },
  checking_parts: { label: 'เช็คอะไหล่ + เสนอราคา', icon: '🔧', color: 'bg-indigo-500' },
  order_parts: { label: 'แจ้งซื้ออะไหล่', icon: '🛒', color: 'bg-cyan-600' },
  send_quote: { label: 'ส่งใบเสนอราคาแล้ว', icon: '📨', color: 'bg-teal-500' },
  waiting_response: { label: 'รอลูกค้าตอบกลับ', icon: '⏳', color: 'bg-amber-500' },
  completed: { label: 'เสร็จสิ้น', icon: '🏁', color: 'bg-gray-500' },
  cancelled: { label: 'ยกเลิก', icon: '❌', color: 'bg-red-500' }
}

const getStatusConfig = (status: string) =>
  STATUS_CONFIG[status as Status] ?? { label: status, icon: '❓', color: 'bg-slate-400' }

// Status transitions
const STATUS_TRANSITIONS: Record<Status, Status[]> = {
  new: ['queue', 'waiting_quote', 'checking_parts', 'cancelled'],
  queue: ['completed', 'cancelled'],
  waiting_quote: ['send_quote', 'cancelled'],
  checking_parts: ['order_parts', 'send_quote', 'cancelled'],
  order_parts: ['send_quote', 'completed', 'cancelled'],
  send_quote: ['waiting_response', 'cancelled'],
  waiting_response: ['new', 'cancelled'],
  completed: [],
  cancelled: []
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [newNameInput, setNewNameInput] = useState('')
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRequest, setEditingRequest] = useState<ServiceRequest | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [pendingDriveFile, setPendingDriveFile] = useState<File | null>(null)
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card')
  const [displayLimit, setDisplayLimit] = useState(50)

  // AI State
  const [isAiLoading, setIsAiLoading] = useState(false)
  const [aiText, setAiText] = useState('')
  const [activeAiTab, setActiveAiTab] = useState<'text' | 'image' | 'voice' | 'pdf' | null>(null)

  // AI Image State
  const [aiImageBase64, setAiImageBase64] = useState<string>('')

  // PDF State
  const [isPdfUploading, setIsPdfUploading] = useState(false)
  const [isPdfAnalyzing, setIsPdfAnalyzing] = useState(false)
  const [pdfBase64, setPdfBase64] = useState<string>('')

  // AI Voice State
  const [isRecording, setIsRecording] = useState(false)
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const [recognitionRef, setRecognitionRef] = useState<any>(null)

  // Auth State (PIN)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')

  // Form state
  const [formData, setFormData] = useState<Partial<ServiceRequest>>({
    channel: 'LINE',
    customerName: '',
    contactName: '',
    phone: '',
    address: '',
    serviceType: 'ล้างแอร์',
    description: '',
    priority: 'normal',
    status: 'new',
    appointmentDate: '',
    appointmentEndDate: '',
    isAllDay: false,
    notes: '',
    imageUrl: '',
    pdfUrl: '',
    pdfFileName: ''
  })

  // Load user and auth state from storage
  useEffect(() => {
    const savedUser = localStorage.getItem('currentUser')
    if (savedUser) setUser(JSON.parse(savedUser))

    const savedAuth = sessionStorage.getItem('isAuthenticated')
    if (savedAuth === 'true') setIsAuthenticated(true)
  }, [])

  // Sync data from Firebase
  useEffect(() => {
    if (!user) return

    setIsLoading(true)
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    const requestsRef = ref(db, 'serviceRequests')
    const unsubscribe = onValue(requestsRef, (snapshot) => {
      const data = snapshot.val()
      if (data) {
        // โหลดเฉพาะ 90 วันล่าสุด และ active jobs (ยังไม่ปิดงาน)
        const requestsArray = (Object.values(data) as ServiceRequest[])
          .filter(r => r.createdAt >= cutoff || (r.status !== 'completed' && r.status !== 'cancelled'))
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        setRequests(requestsArray)
      } else {
        setRequests([])
      }
      setIsLoading(false)
    }, (error) => {
      console.error('Firebase read failed:', error)
      setIsLoading(false)
    })

    return () => unsubscribe()
  }, [user])

  // One-time auto-import if database is empty
  useEffect(() => {
    if (!user || isLoading || requests.length > 0) return

    const hasImported = sessionStorage.getItem('auto_imported')
    if (hasImported) return

    const triggerImport = async () => {
      try {
        console.log('Detected empty database, triggering auto-import from Sheets...')
        const res = await fetch('/api/import')
        const data = await res.json()
        if (data.success && data.count > 0) {
          console.log(`Successfully auto-imported ${data.count} records from Sheets.`)
          sessionStorage.setItem('auto_imported', 'true')
        }
      } catch (e) {
        console.error('Auto-import failed:', e)
      }
    }

    triggerImport()
  }, [user, isLoading, requests.length])

  // Login
  const handleLogin = (selectedUser: User) => {
    setUser(selectedUser)
    localStorage.setItem('currentUser', JSON.stringify(selectedUser))
  }

  // Logout
  const handleLogout = () => {
    setUser(null)
    localStorage.removeItem('currentUser')
    setIsAuthenticated(false)
    sessionStorage.removeItem('isAuthenticated')
  }

  const handleExportExcel = () => {
    const STATUS_LABEL: Record<string, string> = {
      new: 'รับเรื่องใหม่', queue: 'จองคิว/นัดหมาย', waiting_quote: 'ขอใบเสนอราคา',
      checking_parts: 'เช็คอะไหล่+เสนอราคา', order_parts: 'แจ้งซื้ออะไหล่', send_quote: 'ส่งใบเสนอราคาแล้ว',
      waiting_response: 'รอลูกค้าตอบกลับ', completed: 'เสร็จสิ้น', cancelled: 'ยกเลิก'
    }
    const rows = requests.map(r => ({
      'เลขที่งาน': r.requestNo,
      'วันที่รับเรื่อง': r.createdAt ? new Date(r.createdAt).toLocaleDateString('th-TH') : '',
      'ช่องทาง': r.channel,
      'ชื่อร้าน/สาขา': r.customerName,
      'ผู้ติดต่อ': r.contactName || '',
      'เบอร์โทร': r.phone,
      'ที่อยู่': r.address,
      'ประเภทงาน': r.serviceType,
      'รายละเอียด': r.description,
      'ความเร่งด่วน': r.priority === 'urgent' ? 'ด่วน' : r.priority === 'emergency' ? 'ฉุกเฉิน' : 'ปกติ',
      'สถานะ': STATUS_LABEL[r.status] || r.status,
      'วันนัดหมาย': r.appointmentDate ? new Date(r.appointmentDate).toLocaleDateString('th-TH') : '',
      'หมายเหตุ': r.notes,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'งานบริการแอร์')
    const date = new Date().toLocaleDateString('th-TH').replace(/\//g, '-')
    XLSX.writeFile(wb, `งานบริการแอร์_${date}.xlsx`)
  }

  // Handle PIN verification (server-side)
  const handlePinSubmit = async () => {
    try {
      const res = await fetch('/api/auth/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinInput }),
      })
      if (res.ok) {
        setIsAuthenticated(true)
        sessionStorage.setItem('isAuthenticated', 'true')
        setPinError('')
      } else {
        setPinError('รหัส PIN ไม่ถูกต้อง')
        setPinInput('')
      }
    } catch {
      setPinError('เกิดข้อผิดพลาด กรุณาลองใหม่')
    }
  }

  // Generate request number
  const generateRequestNo = () => {
    const date = new Date()
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '')
    const count = requests.filter(r => r.requestNo.includes(dateStr)).length + 1
    return `REQ-${dateStr}-${count.toString().padStart(3, '0')}`
  }

  // Upload image to Firebase Storage + backup to Google Drive
  // Backup รูปไป Google Drive (เรียกตอน submit เพื่อให้ได้ชื่อลูกค้า+สาขา)
  const backupToDrive = async (file: File, customerName: string, address: string) => {
    try {
      const driveForm = new FormData()
      driveForm.append('file', file)
      const params = new URLSearchParams({ customerName, address })
      const driveRes = await fetch(`/api/upload?${params}`, { method: 'POST', body: driveForm })
      if (!driveRes.ok) {
        const errText = await driveRes.text()
        console.warn('Drive backup failed:', driveRes.status, errText)
      }
    } catch (driveErr) {
      console.warn('Drive backup error:', driveErr)
    }
  }

  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      setUploadProgress(0)
      const timestamp = Date.now()
      const ext = file.name.split('.').pop() || 'jpg'
      const fileName = `${timestamp}.${ext}`
      const fileRef = storageRef(storage, `job_images/${fileName}`)

      const uploadTask = uploadBytesResumable(fileRef, file)

      return new Promise((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100
            setUploadProgress(Math.round(progress))
          },
          (error) => {
            console.error('Error uploading image to Firebase:', error)
            reject(null)
          },
          async () => {
            try {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref)
              resolve(downloadURL)
            } catch (err) {
              console.error('Error getting download URL:', err)
              resolve(null)
            } finally {
              setTimeout(() => setUploadProgress(null), 1000)
            }
          }
        )
      })
    } catch (error) {
      console.error('Error starting upload:', error)
      return null
    }
  }

  // Filter requests (no department filtering - everyone sees all)
  const departmentRequests = useMemo(() => {
    if (!user) return []

    let filtered = requests

    // Search
    if (searchTerm) {
      filtered = filtered.filter(r =>
        r.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.phone.includes(searchTerm) ||
        r.requestNo.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(r => r.status === statusFilter)
    }

    return filtered
  }, [requests, user, searchTerm, statusFilter])

  // Stats for dashboard
  const stats = useMemo(() => {
    if (!user) return { total: 0, todo: 0, done: 0 }
    const todoStatuses = ['new', 'queue', 'waiting_quote', 'checking_parts', 'order_parts', 'send_quote', 'waiting_response']
    return {
      total: requests.length,
      todo: requests.filter(r => todoStatuses.includes(r.status)).length,
      done: requests.filter(r => r.status === 'completed').length
    }
  }, [requests, user])

  // Telegram Notification Helper
  const sendTelegramNotification = async (requestData: ServiceRequest, action: 'NEW' | 'UPDATE') => {
    try {
      const statusText = getStatusConfig(requestData.status).label
      const priorityText = requestData.priority === 'urgent' ? '🟡 เร่งด่วน' : requestData.priority === 'emergency' ? '🔴 ฉุกเฉิน' : 'ปกติ'

      let message = `<b>🔔 แจ้งเตือน: ${action === 'NEW' ? 'งานใหม่เข้า' : 'อัปเดตสถานะงาน'}</b>\n\n`
      message += `<b>เลขที่งาน:</b> ${requestData.requestNo}\n`
      message += `<b>ลูกค้า:</b> ${requestData.customerName}\n`
      message += `<b>ประเภทงาน:</b> ${requestData.serviceType}\n`
      message += `<b>สถานะ:</b> ${statusText}\n`
      message += `<b>ความเร่งด่วน:</b> ${priorityText}\n`
      message += `<b>ทำรายการโดย:</b> ${user?.name || 'System'}`

      if (requestData.description) {
        message += `\n\n<b>รายละเอียด:</b> ${requestData.description}`
      }

      if (requestData.imageUrl) {
        message += `\n\n<b><a href="${requestData.imageUrl}">🖼️ ดูรูปภาพประกอบ</a></b>`
      }

      await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      })
    } catch (error) {
      console.error('Error sending Telegram notification:', error)
    }
  }

  // Handle form
  const handleSubmit = async () => {
    if (!formData.customerName || !formData.phone || !formData.address) {
      alert('กรุณากรอกชื่อร้าน/สาขา, เบอร์โทร และที่อยู่ (เป็นช่องบังคับ)')
      return
    }

    // Backup รูปไป Drive พร้อมชื่อลูกค้า+สาขา
    if (pendingDriveFile) {
      backupToDrive(pendingDriveFile, formData.customerName, formData.address)
      setPendingDriveFile(null)
    }

    setIsSaving(true)

    try {
      if (editingRequest) {
        // Update
        const newStatus = formData.status as Status
        const statusChanged = newStatus !== editingRequest.status

        const updatedRequest: ServiceRequest = {
          ...editingRequest,
          ...formData,
          status: newStatus,
          history: statusChanged
            ? [...editingRequest.history, { status: newStatus, date: new Date().toISOString(), by: user?.name || 'System' }]
            : editingRequest.history
        } as ServiceRequest

        // Save to Firebase (state will update automatically via onValue)
        await set(ref(db, `serviceRequests/${updatedRequest.id}`), updatedRequest)

        // Notify if status changed
        if (statusChanged) {
          sendTelegramNotification(updatedRequest, 'UPDATE')
        }

        // Sync to Google Sheets if completed or cancelled
        // Sync to Google Sheets immediately (1:1 sync)
        try {
          // Attempt to PUT to Sheets
          const resSheet = await fetch('/api/sheets', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedRequest)
          });

          // Check for errors
          if (!resSheet.ok) {
            const errorData = await resSheet.json().catch(() => ({ error: 'Unknown error' }));
            console.error('Sheets sync failed:', errorData);
            alert(`⚠️ ไม่สามารถ sync ไปยัง Google Sheets ได้: ${errorData.error || errorData.details || 'Unknown error'}`);
          }

          // Fallback to POST if not found
          if (resSheet.status === 404) {
            const resPost = await fetch('/api/sheets', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updatedRequest)
            });

            if (!resPost.ok) {
              const errorData = await resPost.json().catch(() => ({ error: 'Unknown error' }));
              console.error('Sheets sync (POST) failed:', errorData);
              alert(`⚠️ ไม่สามารถ sync ไปยัง Google Sheets ได้: ${errorData.error || errorData.details || 'Unknown error'}`);
            }
          }
        } catch (e) {
          console.error('Failed to sync update to Google Sheets:', e);
          alert('⚠️ เกิดข้อผิดพลาดในการ sync ไปยัง Google Sheets กรุณาตรวจสอบ console');
        }

        // Sync to Google Calendar if status is queue (POST=ใหม่, PUT=อัพเดท/สร้างใหม่ถ้าถูกลบ)
        if (newStatus === 'queue') {
          try {
            const method = updatedRequest.calendarEventId ? 'PUT' : 'POST'
            const res = await fetch('/api/calendar', {
              method,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...updatedRequest, eventId: updatedRequest.calendarEventId })
            })
            const result = await res.json()
            if (result.success && result.data?.eventId) {
              updatedRequest.calendarEventId = result.data.eventId
              if (result.data.eventUrl) updatedRequest.calendarEventUrl = result.data.eventUrl
              await set(ref(db, `serviceRequests/${updatedRequest.id}`), updatedRequest)
            }
          } catch (e) {
            console.error('Failed to sync to Calendar:', e)
          }
        }
      } else {
        // Create
        const newRequest: ServiceRequest = {
          id: Date.now().toString(),
          requestNo: generateRequestNo(),
          createdAt: new Date().toISOString(),
          channel: formData.channel || 'LINE',
          customerName: formData.customerName || '',
          phone: formData.phone || '',
          address: formData.address || '',
          serviceType: formData.serviceType || 'ล้างแอร์',
          description: formData.description || '',
          priority: formData.priority || 'normal',
          status: formData.status || 'new',
          appointmentDate: formData.appointmentDate || '',
          appointmentEndDate: formData.appointmentEndDate || '',
          isAllDay: formData.isAllDay || false,
          notes: formData.notes || '',
          imageUrl: formData.imageUrl || '',
          pdfUrl: formData.pdfUrl || '',
          pdfFileName: formData.pdfFileName || '',
          history: [{ status: 'new', date: new Date().toISOString(), by: user?.name || 'System' }]
        }

        // Save to Firebase (state will update automatically via onValue)
        await set(ref(db, `serviceRequests/${newRequest.id}`), newRequest)

        // Notify new job
        sendTelegramNotification(newRequest, 'NEW')

        // Sync to Google Sheets immediately (1:1 sync)
        try {
          const resSheet = await fetch('/api/sheets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newRequest)
          });
          
          if (!resSheet.ok) {
            const errorData = await resSheet.json().catch(() => ({ error: 'Unknown error' }));
            console.error('Sheets sync (POST) failed:', errorData);
            alert(`⚠️ ไม่สามารถ sync งานใหม่ไปยัง Google Sheets ได้: ${errorData.error || errorData.details || 'Unknown error'}`);
          }
        } catch (e) {
          console.error('Failed to sync new request to Google Sheets:', e);
          alert('⚠️ เกิดข้อผิดพลาดในการ sync งานใหม่ไปยัง Google Sheets กรุณาตรวจสอบ console');
        }

        // Sync to Google Calendar if created as queue
        if (newRequest.status === 'queue') {
          try {
            const res = await fetch('/api/calendar', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(newRequest)
            })
            const result = await res.json()
            if (result.success && result.data?.eventId) {
              newRequest.calendarEventId = result.data.eventId
              if (result.data.eventUrl) newRequest.calendarEventUrl = result.data.eventUrl
              await set(ref(db, `serviceRequests/${newRequest.id}`), newRequest)
            }
          } catch (e) {
            console.error('Failed to sync to Calendar:', e)
          }
        }
      }
      closeModal()
    } catch (error) {
      console.error('Error saving:', error)
      alert('บันทึกไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setIsSaving(false)
    }
  }

  const openModal = useCallback((request?: ServiceRequest) => {
    if (request) {
      setEditingRequest(request)
      setFormData(request)
    } else {
      setEditingRequest(null)
      setFormData({
        channel: 'LINE',
        customerName: '',
        contactName: '',
        phone: '',
        address: '',
        serviceType: 'ล้างแอร์',
        description: '',
        priority: 'normal',
        status: 'new',
        appointmentDate: '',
        appointmentEndDate: '',
        isAllDay: false,
        notes: '',
        imageUrl: '',
        pdfUrl: '',
        pdfFileName: ''
      })
    }
    setIsModalOpen(true)
  }, [])

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingRequest(null)
    setUploadProgress(null)
    setPendingDriveFile(null)
    setPdfBase64('')
  }

  const updateStatus = async (id: string, newStatus: Status) => {
    const request = requests.find(r => r.id === id)
    if (!request) return

    const updatedRequest = {
      ...request,
      status: newStatus,
      history: [...request.history, { status: newStatus, date: new Date().toISOString(), by: user?.name || 'System' }]
    } as ServiceRequest

    try {
      if (newStatus === 'queue') {
        try {
          const method = request.calendarEventId ? 'PUT' : 'POST'
          const res = await fetch('/api/calendar', {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...updatedRequest, eventId: request.calendarEventId })
          })
          const result = await res.json()
          if (result.success && result.data?.eventId) {
            updatedRequest.calendarEventId = result.data.eventId
            if (result.data.eventUrl) updatedRequest.calendarEventUrl = result.data.eventUrl
          }
        } catch (e) {
          console.error('Failed to sync to Calendar:', e)
        }
      }

      await update(ref(db, `serviceRequests/${id}`), updatedRequest)

      // Notify status update
      sendTelegramNotification(updatedRequest as ServiceRequest, 'UPDATE')

      // Auto sync to Google Sheets always (1:1 sync)
      try {
        await fetch('/api/sheets', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedRequest)
        })
          // If PUT fails (record not found), try POST
          .then(async res => {
            if (res.status === 404) {
              await fetch('/api/sheets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedRequest)
              })
            }
          })
      } catch (e) {
        console.error('Failed to sync to Google Sheets:', e)
      }
    } catch (error) {
      console.error('Error updating status:', error)
      alert('อัปเดตสถานะไม่สำเร็จ กรุณาลองใหม่')
    }
  }

  const deleteRequest = async (id: string) => {
    if (!confirm('ยืนยันการลบรายการนี้?')) return

    try {
      await remove(ref(db, `serviceRequests/${id}`))

      // Sync Delete to Google Sheets
      try {
        const resSheet = await fetch(`/api/sheets?id=${id}`, {
          method: 'DELETE'
        });

        if (!resSheet.ok) {
          const errorData = await resSheet.json().catch(() => ({ error: 'Unknown error' }));
          console.error('Sheets delete sync failed:', errorData);
          alert(`⚠️ ไม่สามารถลบจาก Google Sheets ได้: ${errorData.error || errorData.details || 'Unknown error'}`);
        }
      } catch (e) {
        console.error('Failed to sync delete to Google Sheets:', e);
        alert('⚠️ เกิดข้อผิดพลาดในการลบจาก Google Sheets กรุณาตรวจสอบ console');
      }
    } catch (error) {
      console.error('Error deleting:', error)
      alert('ลบไม่สำเร็จ กรุณาลองใหม่')
    }
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // Handle file input change
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setPendingDriveFile(file)
    const url = await uploadImage(file)
    if (url) {
      setFormData(prev => ({ ...prev, imageUrl: url }))
    } else {
      alert('อัปโหลดรูปไม่สำเร็จ')
    }
  }

  // PDF Upload Handler
  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const isPdf = file.type === 'application/pdf' || file.name.match(/\.pdf$/i)
    if (!isPdf) {
      alert('รองรับเฉพาะไฟล์ PDF เท่านั้น')
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      alert('ไฟล์ PDF ใหญ่เกิน 20MB')
      return
    }

    setIsPdfUploading(true)
    try {
      // Upload to Google Drive
      const form = new FormData()
      form.append('file', file)
      const params = new URLSearchParams({
        customerName: formData.customerName || '',
        address: formData.address || ''
      })
      const res = await fetch(`/api/upload?${params}`, { method: 'POST', body: form })
      const data = await res.json()

      if (data.success) {
        setFormData(prev => ({
          ...prev,
          pdfUrl: data.data.webViewLink || data.data.directUrl,
          pdfFileName: file.name
        }))
        // Store base64 for AI analysis
        const reader = new FileReader()
        reader.onload = (ev) => {
          if (ev.target?.result) setPdfBase64(ev.target.result as string)
        }
        reader.readAsDataURL(file)
      } else {
        alert('อัปโหลด PDF ไม่สำเร็จ: ' + (data.error || 'เกิดข้อผิดพลาด'))
      }
    } catch (err) {
      console.error('PDF upload error:', err)
      alert('อัปโหลด PDF ไม่สำเร็จ')
    } finally {
      setIsPdfUploading(false)
    }
  }

  // PDF AI Analysis Handler
  const handlePdfAnalyze = async () => {
    if (!pdfBase64) {
      alert('กรุณาอัปโหลด PDF ก่อน')
      return
    }

    setIsPdfAnalyzing(true)
    try {
      const response = await fetch('/api/ai/analyze-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64 })
      })
      const result = await response.json()

      if (result.success && result.data) {
        const d = result.data
        setFormData(prev => ({
          ...prev,
          customerName: d.shopName || prev.customerName,
          contactName: d.contactName || prev.contactName,
          phone: d.phone || prev.phone,
          address: d.address || prev.address,
          serviceType: d.serviceType || prev.serviceType,
          description: d.description || prev.description
        }))
        setActiveAiTab(null)
        alert('AI อ่าน PDF สำเร็จ! ข้อมูลถูกกรอกแล้ว')
      } else {
        alert('AI อ่าน PDF ไม่สำเร็จ: ' + (result.error || 'เกิดข้อผิดพลาด'))
      }
    } catch (err) {
      console.error('PDF analyze error:', err)
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI')
    } finally {
      setIsPdfAnalyzing(false)
    }
  }

  // AI Analysis Handle
  const handleAiAnalyze = async () => {
    if (!aiText.trim()) return

    setIsAiLoading(true)
    try {
      const response = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: aiText })
      })

      const result = await response.json()

      if (result.success && result.data) {
        setFormData(prev => ({
          ...prev,
          customerName: result.data.customerName || prev.customerName,
          contactName: result.data.contactName || prev.contactName,
          phone: result.data.phone || prev.phone,
          address: result.data.address || prev.address,
          serviceType: result.data.serviceType || prev.serviceType,
          priority: result.data.priority || prev.priority,
          description: result.data.description || prev.description
        }))
        setAiText('')
        setActiveAiTab(null) // Close the AI panel after success
      } else {
        alert('AI วิเคราะห์ไม่สำเร็จ: ' + (result.error || 'เกิดข้อผิดพลาดบางอย่าง'))
      }
    } catch (error) {
      console.error('Error analyzing text:', error)
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI')
    } finally {
      setIsAiLoading(false)
    }
  }

  // AI Image Analysis Handle
  const handleAiImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      if (ev.target?.result) {
        setAiImageBase64(ev.target.result as string)
      }
    }
    reader.readAsDataURL(file)
  }

  const handleAiImageAnalyze = async () => {
    if (!aiImageBase64) return

    setIsAiLoading(true)
    try {
      const response = await fetch('/api/ai/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: aiImageBase64 })
      })

      const result = await response.json()

      if (result.success && result.data) {
        setFormData(prev => ({
          ...prev,
          customerName: result.data.shopName || result.data.customerName || prev.customerName,
          contactName: result.data.contactName || prev.contactName,
          phone: result.data.phone || prev.phone,
          address: result.data.address || prev.address,
          serviceType: result.data.serviceType || prev.serviceType,
          description: result.data.description || prev.description
        }))
        setAiImageBase64('')
        setActiveAiTab(null) // Close the AI panel after success
      } else {
        alert('AI วิเคราะห์รูปภาพไม่สำเร็จ: ' + (result.error || 'เกิดข้อผิดพลาดบางอย่าง'))
      }
    } catch (error) {
      console.error('Error analyzing image:', error)
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI')
    } finally {
      setIsAiLoading(false)
    }
  }

  // AI Voice Logic
  const toggleVoiceRecording = () => {
    if (isRecording) {
      if (recognitionRef) {
        recognitionRef.stop()
      }
      return
    }


    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      alert('บราวเซอร์นี้ไม่รองรับการรับเสียง กรุณาใช้ Chrome บน PC หรือ Android')
      return
    }

    setVoiceTranscript('')
    const recognition = new SR()
    recognition.lang = 'th-TH'
    recognition.continuous = true
    recognition.interimResults = true


    recognition.onresult = (e: any) => {
      let t = ''
      for (let i = 0; i < e.results.length; i++) {
        t += e.results[i][0].transcript
      }
      setVoiceTranscript(t)
    }

    recognition.onend = () => {
      setIsRecording(false)
      setRecognitionRef(null)
    }

    recognition.onerror = () => {
      setIsRecording(false)
      setRecognitionRef(null)
    }

    recognition.start()
    setIsRecording(true)
    setRecognitionRef(recognition)
  }

  const handleAiVoiceAnalyze = async () => {
    if (!voiceTranscript.trim()) return

    setIsAiLoading(true)
    try {
      const response = await fetch('/api/ai/analyze', {
        method: 'POST', // Re-use the text analysis route for voice transcript
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: voiceTranscript })
      })

      const result = await response.json()

      if (result.success && result.data) {
        setFormData(prev => ({
          ...prev,
          customerName: result.data.customerName || prev.customerName,
          phone: result.data.phone || prev.phone,
          address: result.data.address || prev.address,
          serviceType: result.data.serviceType || prev.serviceType,
          priority: result.data.priority || prev.priority,
          description: result.data.description || prev.description
        }))
        setVoiceTranscript('')
        setActiveAiTab(null) // Close the AI panel after success
      } else {
        alert('AI วิเคราะห์เสียงไม่สำเร็จ: ' + (result.error || 'เกิดข้อผิดพลาดบางอย่าง'))
      }
    } catch (error) {
      console.error('Error analyzing voice:', error)
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI')
    } finally {
      setIsAiLoading(false)
    }
  }

  // === AUTH SCREEN (PIN) ===
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-blue-500 rounded-2xl flex items-center justify-center text-4xl mx-auto mb-4 shadow-lg">
              🔒
            </div>
            <h1 className="text-2xl font-bold text-slate-800">ระบบภายในร้าน</h1>
            <p className="text-slate-500 mt-2">กรุณาใส่รหัส PIN เพื่อเข้าใช้งาน</p>
          </div>

          <div className="space-y-4">
            <div>
              <input
                type="password"
                placeholder="กรอกรหัส PIN 6 หลัก"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handlePinSubmit()
                }}
                className={`w-full px-4 py-3 border-2 rounded-xl text-center text-xl tracking-widest focus:ring-2 focus:ring-blue-500 outline-none ${pinError ? 'border-red-300 bg-red-50 text-red-700' : 'border-slate-200 bg-slate-50'}`}
                maxLength={6}
                inputMode="numeric"
              />
              {pinError && <p className="text-red-500 text-sm text-center mt-2">{pinError}</p>}
            </div>
            <button
              onClick={handlePinSubmit}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white px-5 py-3 rounded-xl font-semibold transition-all"
            >
              เข้าสู่ระบบ
            </button>
          </div>
        </div>
      </div>
    )
  }

  // === LOGIN SCREEN (USER SELECTION) ===
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-blue-500 rounded-2xl flex items-center justify-center text-4xl mx-auto mb-4 shadow-lg">
              ❄️
            </div>
            <h1 className="text-2xl font-bold text-slate-800">ระบบรับงานบริการแอร์</h1>
            <p className="text-slate-500 mt-2">เลือกชื่อเพื่อเข้าสู่ระบบ</p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">ชื่อของคุณ</label>
              <select
                onChange={(e) => {
                  const u = USERS.find(u => u.id === e.target.value)
                  if (u) { handleLogin(u); }
                }}
                defaultValue=""
                className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-sm bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none mb-3"
              >
                <option value="">— เลือกชื่อ —</option>
                {USERS.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              <p className="text-xs text-slate-400 text-center mb-2">―― หรือถ้าไม่มีชื่อ ――</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="กรอกชื่อใหม่ เช่น คุณสมชาย"
                  value={newNameInput}
                  onChange={(e) => setNewNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newNameInput.trim()) {
                      handleLogin({ id: 'temp_' + Date.now(), name: newNameInput.trim() })
                    }
                  }}
                  className="flex-1 px-4 py-3 border-2 border-slate-200 rounded-xl text-sm bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <button
                  onClick={() => {
                    if (newNameInput.trim()) handleLogin({ id: 'temp_' + Date.now(), name: newNameInput.trim() })
                  }}
                  className="bg-blue-500 hover:bg-blue-600 text-white px-5 py-3 rounded-xl text-sm font-semibold transition-all"
                >
                  เข้า
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // === MAIN APP ===
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center text-xl text-white">
                ❄️
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-800">ระบบรับงานบริการแอร์</h1>
                <p className="text-xs text-slate-500">👤 {user.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Storage indicator - Removed as Firebase handles it */}
              <button
                onClick={() => openModal()}
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-1"
              >
                <span>+</span> เพิ่มงาน
              </button>
              <button
                onClick={handleExportExcel}
                className="bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded-xl text-sm font-medium"
                title="Export Excel"
              >
                📥 Excel
              </button>
              <button
                onClick={handleLogout}
                className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-2 rounded-xl text-sm"
              >
                ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-4 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
            <div className="text-3xl font-bold text-slate-800">{stats.total}</div>
            <div className="text-xs text-slate-500">งานทั้งหมด</div>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-amber-200 bg-amber-50">
            <div className="text-3xl font-bold text-amber-600">{stats.todo}</div>
            <div className="text-xs text-amber-600">รอดำเนินการ</div>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-green-200 bg-green-50">
            <div className="text-3xl font-bold text-green-600">{stats.done}</div>
            <div className="text-xs text-green-600">เสร็จสิ้น</div>
          </div>
        </div>

        {/* Search */}
        <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-200">
          <div className="flex gap-2 flex-wrap sm:flex-nowrap">
            <div className="flex-1 relative min-w-[200px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
              <input
                type="text"
                placeholder="ค้นหาชื่อ, เบอร์โทร, เลขที่งาน..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50"
            >
              <option value="all">ทุกสถานะ</option>
              {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                <option key={key} value={key}>{config.icon} {config.label}</option>
              ))}
            </select>
            <div className="hidden sm:flex bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => setViewMode('card')}
                className={`px-3 py-1 text-sm rounded-lg font-medium transition-all ${viewMode === 'card' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                title="Card View"
              >
                📱 โมบาย
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`px-3 py-1 text-sm rounded-lg font-medium transition-all ${viewMode === 'table' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                title="Table View"
              >
                💻 ตาราง
              </button>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {isLoading ? (
          <div className="bg-white rounded-2xl p-12 shadow-sm border border-slate-200 text-center">
            <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-3"></div>
            <p className="text-slate-500">กำลังโหลดข้อมูล...</p>
          </div>
        ) : departmentRequests.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 shadow-sm border border-slate-200 text-center">
            <div className="text-5xl mb-3">📭</div>
            <p className="text-slate-500">ไม่มีงานที่ต้องดำเนินการ</p>
          </div>
        ) : viewMode === 'table' ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-sm font-semibold text-slate-600">
                    <th className="px-4 py-3 whitespace-nowrap">เลขที่งาน / วันที่</th>
                    <th className="px-4 py-3 whitespace-nowrap">ลูกค้า</th>
                    <th className="px-4 py-3 whitespace-nowrap">ประเภทงาน</th>
                    <th className="px-4 py-3 whitespace-nowrap">สถานะปัจจุบัน</th>
                    <th className="px-4 py-3 whitespace-nowrap text-right">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {departmentRequests.slice(0, displayLimit).map((request) => (
                    <tr key={request.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 align-top">
                        <div className="font-mono text-sm text-blue-600">
                          {request.calendarEventUrl ? (
                            <a href={request.calendarEventUrl} target="_blank" rel="noreferrer" className="hover:underline" title="เปิดปฏิทิน">📅 {request.requestNo}</a>
                          ) : (
                            request.requestNo
                          )}
                        </div>
                        <div className="text-xs text-slate-500">{formatDate(request.createdAt)}</div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="font-medium text-slate-800 text-sm whitespace-nowrap">{request.customerName}</div>
                        {request.contactName && <div className="text-xs text-blue-600">👤 {request.contactName}</div>}
                        <div className="text-xs text-slate-500">{request.phone}</div>
                        {request.address && <div className="text-xs text-slate-400 mt-1 truncate max-w-[200px]" title={request.address}>📍 {request.address}</div>}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-xs text-slate-600 whitespace-nowrap">{request.serviceType}</span>
                          <span className="text-xs text-slate-500">ผ่าน {request.channel}</span>
                        </div>
                        {request.priority !== 'normal' && (
                          <div className={`mt-1.5 px-2 py-0.5 rounded text-[10px] inline-block font-medium ${request.priority === 'urgent' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                            {request.priority === 'urgent' ? '🟡 เร่งด่วน' : '🔴 ฉุกเฉิน'}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top whitespace-nowrap">
                        <span className={`px-2 py-1 rounded-lg text-xs font-medium text-white ${getStatusConfig(request.status).color}`}>
                          {getStatusConfig(request.status).icon} {getStatusConfig(request.status).label}
                        </span>
                        {/* Quick Status Change */}
                        {STATUS_TRANSITIONS[request.status].length > 0 && (
                          <div className="mt-2 text-[10px] text-slate-400">เปลี่ยนเป็น:</div>
                        )}
                        <div className="mt-1 flex flex-wrap gap-1 max-w-[200px]">
                          {STATUS_TRANSITIONS[request.status].map((nextStatus) => (
                            <button
                              key={nextStatus}
                              onClick={() => updateStatus(request.id, nextStatus)}
                              className={`px-1.5 py-0.5 rounded border text-[10px] font-medium transition-all ${getStatusConfig(nextStatus).color.replace('bg-', 'text-').replace('500', '600')} bg-white hover:bg-slate-50`}
                              title={getStatusConfig(nextStatus).label}
                            >
                              {getStatusConfig(nextStatus).icon}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top text-right whitespace-nowrap">
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => openModal(request)}
                            className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                            title="แก้ไข"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => deleteRequest(request.id)}
                            className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                            title="ลบ"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="space-y-3 sm:grid sm:grid-cols-2 sm:gap-4 sm:space-y-0 lg:grid-cols-3">
            {departmentRequests.slice(0, displayLimit).map((request) => (
              <div key={request.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className="text-xs font-mono text-blue-600">
                      {request.calendarEventUrl ? (
                        <a href={request.calendarEventUrl} target="_blank" rel="noreferrer" className="hover:underline" title="เปิดปฏิทิน">📅 {request.requestNo}</a>
                      ) : (
                        request.requestNo
                      )}
                    </span>
                    <span className="mx-2 text-slate-300">|</span>
                    <span className="text-xs text-slate-500">{formatDate(request.createdAt)}</span>
                  </div>
                  <span className={`px-2 py-1 rounded-lg text-xs font-medium text-white ${getStatusConfig(request.status).color}`}>
                    {getStatusConfig(request.status).icon} {getStatusConfig(request.status).label}
                  </span>
                </div>

                <div className="mb-3">
                  <div className="font-semibold text-slate-800">{request.customerName}</div>
                  {request.contactName && <div className="text-xs text-blue-600">👤 {request.contactName}</div>}
                  <div className="text-sm text-slate-500">{request.phone}</div>
                  {request.address && <div className="text-xs text-slate-400 mt-1">📍 {request.address}</div>}
                </div>

                {/* Image Preview */}
                {request.imageUrl && (
                  <div className="mb-3">
                    <img
                      src={request.imageUrl}
                      alt="รูปภาพ"
                      className="w-full max-w-xs rounded-xl border border-slate-200"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none'
                      }}
                    />
                  </div>
                )}

                {/* PDF Link */}
                {request.pdfUrl && (
                  <div className="mb-3">
                    <a
                      href={request.pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm rounded-lg border border-slate-200"
                    >
                      <span>📄</span>
                      <span className="truncate max-w-[200px]">{request.pdfFileName || 'เปิดดูไฟล์ PDF'}</span>
                    </a>
                  </div>
                )}

                <div className="flex items-center gap-2 mb-3 text-sm">
                  <span className="bg-slate-100 px-2 py-1 rounded text-slate-600">{request.serviceType}</span>
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-500">{request.channel}</span>
                  {request.priority !== 'normal' && (
                    <>
                      <span className="text-slate-400">•</span>
                      <span className={`px-2 py-1 rounded text-xs ${request.priority === 'urgent' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                        {request.priority === 'urgent' ? '🟡 เร่งด่วน' : '🔴 ฉุกเฉิน'}
                      </span>
                    </>
                  )}
                </div>

                {request.description && (
                  <p className="text-sm text-slate-500 mb-3 bg-slate-50 rounded-xl p-2">{request.description}</p>
                )}

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2">
                  {/* Status Change Buttons */}
                  {STATUS_TRANSITIONS[request.status].map((nextStatus) => (
                    <button
                      key={nextStatus}
                      onClick={() => updateStatus(request.id, nextStatus)}
                      className={`px-3 py-2 rounded-xl text-xs font-medium text-white ${getStatusConfig(nextStatus).color} hover:opacity-90 transition-all`}
                    >
                      {getStatusConfig(nextStatus).icon} {getStatusConfig(nextStatus).label}
                    </button>
                  ))}

                  {/* Edit/Delete */}
                  <button
                    onClick={() => openModal(request)}
                    className="px-3 py-2 rounded-xl text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200"
                  >
                    ✏️ แก้ไข
                  </button>
                  <button
                    onClick={() => deleteRequest(request.id)}
                    className="px-3 py-2 rounded-xl text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100"
                  >
                    🗑️ ลบ
                  </button>
                </div>

                {/* History */}
                {request.history.length > 1 && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <p className="text-xs text-slate-400 mb-1">ประวัติ:</p>
                    <div className="flex flex-wrap gap-1">
                      {request.history.map((h, i) => (
                        <span key={i} className="text-xs bg-slate-50 px-2 py-0.5 rounded text-slate-500">
                          {getStatusConfig(h.status).icon} {h.status === 'new' ? 'เริ่มต้น' : getStatusConfig(h.status).label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Load More Button */}
        {departmentRequests.length > displayLimit && (
          <div className="text-center mt-4">
            <button
              onClick={() => setDisplayLimit(prev => prev + 50)}
              className="px-6 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-sm font-medium transition-colors"
            >
              โหลดเพิ่ม ({departmentRequests.length - displayLimit} รายการที่เหลือ)
            </button>
          </div>
        )}
      </main>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-4 py-3 border-b flex items-center justify-between">
              <h2 className="font-bold text-lg">
                {editingRequest ? '✏️ แก้ไขงาน' : '➕ เพิ่มงานใหม่'}
              </h2>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>

            <div className="p-4 space-y-3">
              {/* AI Smart Paste */}
              <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl p-3 border border-indigo-100">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-indigo-700 font-medium text-sm">
                    <span>✨</span>
                    <span>AI ช่วยเติมข้อมูล</span>
                  </div>
                  {activeAiTab && (
                    <button
                      onClick={() => {
                        setActiveAiTab(null)
                        setAiText('')
                      }}
                      className="text-slate-400 hover:text-slate-600 text-xs"
                    >
                      ✕ ปิด
                    </button>
                  )}
                </div>

                {!activeAiTab ? (
                  <div className="grid grid-cols-4 gap-2">
                    <button
                      onClick={() => setActiveAiTab('text')}
                      className="bg-white hover:bg-indigo-50 text-indigo-600 py-2 rounded-lg text-xs font-medium border border-indigo-100 transition-colors flex flex-col items-center gap-1"
                    >
                      <span className="text-lg">📋</span>
                      วางข้อความ
                    </button>
                    <button
                      onClick={() => setActiveAiTab('image')}
                      className="bg-white hover:bg-indigo-50 text-indigo-600 py-2 rounded-lg text-xs font-medium border border-indigo-100 transition-colors flex flex-col items-center gap-1"
                    >
                      <span className="text-lg">🖼️</span>
                      สแกนรูปภาพ
                    </button>
                    <button
                      onClick={() => setActiveAiTab('voice')}
                      className="bg-white hover:bg-indigo-50 text-indigo-600 py-2 rounded-lg text-xs font-medium border border-indigo-100 transition-colors flex flex-col items-center gap-1"
                    >
                      <span className="text-lg">🎙️</span>
                      พูดสั่งงาน
                    </button>
                    <button
                      onClick={() => setActiveAiTab('pdf')}
                      className="bg-white hover:bg-indigo-50 text-indigo-600 py-2 rounded-lg text-xs font-medium border border-indigo-100 transition-colors flex flex-col items-center gap-1"
                    >
                      <span className="text-lg">📄</span>
                      อ่าน PDF
                    </button>
                  </div>
                ) : (
                  <div className="bg-white rounded-lg p-2 border border-indigo-100">
                    {activeAiTab === 'text' && (
                      <div className="space-y-2">
                        <textarea
                          placeholder="วางข้อความแชทลูกค้า, ข้อมูลงาน หรือที่อยู่ตรงนี้..."
                          value={aiText}
                          onChange={(e) => setAiText(e.target.value)}
                          className="w-full text-sm p-2 bg-slate-50 border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500 min-h-[80px]"
                        />
                        <button
                          onClick={handleAiAnalyze}
                          disabled={!aiText.trim() || isAiLoading}
                          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {isAiLoading ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                              กำลังวิเคราะห์...
                            </>
                          ) : (
                            '🚀 วิเคราะห์ข้อมูล'
                          )}
                        </button>
                      </div>
                    )}
                    {activeAiTab === 'image' && (
                      <div className="space-y-2">
                        {aiImageBase64 ? (
                          <div className="relative">
                            <img
                              src={aiImageBase64}
                              alt="Image to scan"
                              className="w-full max-h-48 rounded-xl border border-slate-200 object-contain bg-slate-50"
                            />
                            <button
                              type="button"
                              onClick={() => setAiImageBase64('')}
                              className="absolute top-2 right-2 bg-slate-800/50 text-white p-1 rounded-full text-xs hover:bg-red-500 transition-colors"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div className="border-2 border-dashed border-indigo-200 rounded-xl p-4 text-center bg-indigo-50/50">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleAiImageUpload}
                              className="hidden"
                              id="ai-image-upload"
                            />
                            <label htmlFor="ai-image-upload" className="cursor-pointer">
                              <div className="text-3xl mb-2">📸</div>
                              <p className="text-sm font-medium text-indigo-600">สแกนรูปภาพบิล / รูปหน้างาน</p>
                              <p className="text-xs text-slate-500 mt-1">อัปโหลดรูปเพื่อให้ AI ดึงข้อมูลลูกค้าให้</p>
                            </label>
                          </div>
                        )}
                        <button
                          onClick={handleAiImageAnalyze}
                          disabled={!aiImageBase64 || isAiLoading}
                          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {isAiLoading ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                              กำลังสแกนรูปภาพ...
                            </>
                          ) : (
                            '🤖 ให้ AI วิเคราะห์รูปภาพนี้'
                          )}
                        </button>
                      </div>
                    )}
                    {activeAiTab === 'pdf' && (
                      <div className="space-y-2">
                        {formData.pdfUrl ? (
                          <div className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg">
                            <span className="text-xl">📄</span>
                            <span className="text-xs text-slate-600 truncate flex-1">{formData.pdfFileName || 'ไฟล์ PDF'}</span>
                          </div>
                        ) : (
                          <div className="border-2 border-dashed border-indigo-200 rounded-lg p-3 text-center">
                            <input
                              type="file"
                              accept="application/pdf,.pdf"
                              onChange={handlePdfUpload}
                              className="hidden"
                              id="ai-pdf-upload"
                            />
                            <label htmlFor="ai-pdf-upload" className="cursor-pointer">
                              {isPdfUploading ? (
                                <div className="flex flex-col items-center gap-1">
                                  <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
                                  <p className="text-xs text-slate-500">กำลังอัปโหลด...</p>
                                </div>
                              ) : (
                                <>
                                  <div className="text-2xl mb-1">📎</div>
                                  <p className="text-xs text-indigo-600 font-medium">คลิกเลือกไฟล์ PDF</p>
                                  <p className="text-xs text-slate-400">สูงสุด 20MB</p>
                                </>
                              )}
                            </label>
                          </div>
                        )}
                        <button
                          onClick={handlePdfAnalyze}
                          disabled={!pdfBase64 || isPdfAnalyzing}
                          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {isPdfAnalyzing ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                              AI กำลังอ่าน PDF...
                            </>
                          ) : (
                            '🤖 ให้ AI อ่านและกรอกข้อมูล'
                          )}
                        </button>
                        {!pdfBase64 && !formData.pdfUrl && (
                          <p className="text-xs text-slate-400 text-center">อัปโหลด PDF ก่อน แล้วกด AI อ่าน</p>
                        )}
                      </div>
                    )}

                    {activeAiTab === 'voice' && (
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={toggleVoiceRecording}
                          className={`w-full py-3 rounded-lg font-bold text-sm transition-all flex flex-col items-center justify-center gap-1 border-2 ${isRecording
                            ? 'bg-red-50 text-red-600 border-red-200 shadow-inner'
                            : 'bg-white text-indigo-600 border-indigo-100 hover:border-indigo-300'
                            }`}
                        >
                          {isRecording ? (
                            <>
                              <span className="text-2xl animate-pulse">🔴</span>
                              กำลังฟังเสียงของคุณ... (กดเพื่อหยุด)
                            </>
                          ) : (
                            <>
                              <span className="text-2xl">🎤</span>
                              กดปุ่มแล้วพูดสั่งงานได้เลย
                            </>
                          )}
                        </button>

                        {voiceTranscript && (
                          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-sm text-slate-700 min-h-[60px]">
                            {voiceTranscript}
                          </div>
                        )}

                        {voiceTranscript && (
                          <button
                            onClick={handleAiVoiceAnalyze}
                            disabled={isAiLoading || isRecording}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            {isAiLoading ? (
                              <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                กำลังวิเคราะห์เสียง...
                              </>
                            ) : (
                              '🤖 ให้ AI วิเคราะห์ข้อความเสียง'
                            )}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Channel */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ช่องทาง</label>
                <div className="flex flex-wrap gap-2">
                  {['LINE', 'โทร', 'Walk-in', 'Facebook', 'อื่นๆ'].map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, channel: ch as ServiceRequest['channel'] }))}
                      className={`px-3 py-1.5 rounded-lg text-sm ${formData.channel === ch ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600'}`}
                    >
                      {ch}
                    </button>
                  ))}
                </div>
              </div>

              {/* Name & Phone */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">ชื่อร้าน / สาขา *</label>
                  <input
                    type="text"
                    value={formData.customerName || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, customerName: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-xl text-sm"
                    placeholder="เช่น KFC สาขาสีลม, ที.เอส มอเตอร์"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">ผู้ติดต่อ</label>
                  <input
                    type="text"
                    value={formData.contactName || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, contactName: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-xl text-sm"
                    placeholder="ชื่อผู้ติดต่อ (ถ้ามี)"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">เบอร์โทร *</label>
                  <input
                    type="tel"
                    value={formData.phone || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-xl text-sm"
                    placeholder="081-234-5678"
                  />
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ที่อยู่ *</label>
                <input
                  type="text"
                  value={formData.address || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-xl text-sm"
                  placeholder="ที่อยู่ปฏิบัติงาน"
                />
              </div>

              {/* Service Type */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ประเภทงาน</label>
                <select
                  value={formData.serviceType || 'ล้างแอร์'}
                  onChange={(e) => setFormData(prev => ({ ...prev, serviceType: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-xl text-sm"
                >
                  <option>ล้างแอร์</option>
                  <option>ซ่อม</option>
                  <option>ติดตั้ง</option>
                  <option>ตรวจสอบ</option>
                  <option>บำรุงรักษา</option>
                  <option>อื่นๆ</option>
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">รายละเอียด</label>
                <textarea
                  value={formData.description || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-xl text-sm resize-none"
                  rows={2}
                  placeholder="รายละเอียดงาน"
                />
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ความเร่งด่วน</label>
                <div className="flex gap-2">
                  {[
                    { key: 'normal', label: '⚪ ปกติ' },
                    { key: 'urgent', label: '🟡 เร่งด่วน' },
                    { key: 'emergency', label: '🔴 ฉุกเฉิน' }
                  ].map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, priority: p.key as ServiceRequest['priority'] }))}
                      className={`flex-1 px-3 py-2 rounded-xl text-sm ${formData.priority === p.key ? 'bg-slate-200 ring-2 ring-slate-400' : 'bg-slate-50'}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Image Upload */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">📷 รูปภาพ</label>
                <div className="space-y-2">
                  {formData.imageUrl ? (
                    <div className="relative">
                      <img
                        src={formData.imageUrl}
                        alt="Preview"
                        className="w-full max-w-xs rounded-xl border border-slate-200"
                      />
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, imageUrl: '' }))}
                        className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full text-xs"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="hidden"
                        id="image-upload"
                      />
                      <label htmlFor="image-upload" className="cursor-pointer">
                        {uploadProgress !== null ? (
                          <div className="space-y-2">
                            <div className="w-full bg-slate-200 rounded-full h-2">
                              <div
                                className="bg-blue-500 h-2 rounded-full transition-all"
                                style={{ width: `${uploadProgress}%` }}
                              />
                            </div>
                            <p className="text-sm text-slate-500">กำลังอัปโหลด...</p>
                          </div>
                        ) : (
                          <>
                            <div className="text-3xl mb-2">📤</div>
                            <p className="text-sm text-slate-500">คลิกเพื่ออัปโหลดรูปภาพ</p>
                            <p className="text-xs text-slate-400">รองรับ JPG, PNG, GIF (สูงสุด 10MB)</p>
                          </>
                        )}
                      </label>
                    </div>
                  )}
                </div>
              </div>

              {/* PDF Upload */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">📄 แนบไฟล์ PDF (ใบเสนอราคา / เอกสาร)</label>
                <div className="space-y-2">
                  {formData.pdfUrl ? (
                    <div className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-xl">
                      <span className="text-2xl">📄</span>
                      <div className="flex-1 min-w-0">
                        <a
                          href={formData.pdfUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-blue-600 underline truncate block"
                        >
                          {formData.pdfFileName || 'เปิดดูไฟล์ PDF'}
                        </a>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {pdfBase64 && (
                          <button
                            type="button"
                            onClick={handlePdfAnalyze}
                            disabled={isPdfAnalyzing}
                            className="px-3 py-1 bg-purple-600 text-white text-xs rounded-lg disabled:opacity-50"
                          >
                            {isPdfAnalyzing ? '⏳ กำลังอ่าน...' : '🤖 AI อ่าน PDF'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setFormData(prev => ({ ...prev, pdfUrl: '', pdfFileName: '' }))
                            setPdfBase64('')
                          }}
                          className="px-2 py-1 bg-red-500 text-white text-xs rounded-lg"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center">
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        onChange={handlePdfUpload}
                        className="hidden"
                        id="pdf-upload"
                      />
                      <label htmlFor="pdf-upload" className="cursor-pointer">
                        {isPdfUploading ? (
                          <div className="space-y-1">
                            <div className="text-2xl">⏳</div>
                            <p className="text-sm text-slate-500">กำลังอัปโหลด PDF...</p>
                          </div>
                        ) : (
                          <>
                            <div className="text-3xl mb-2">📎</div>
                            <p className="text-sm text-slate-500">คลิกเพื่ออัปโหลด PDF</p>
                            <p className="text-xs text-slate-400">รองรับ PDF (สูงสุด 20MB) — AI จะอ่านข้อมูลให้อัตโนมัติ</p>
                          </>
                        )}
                      </label>
                    </div>
                  )}
                </div>
              </div>

              {/* Appointment Date */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-slate-700">วันที่นัดหมาย (ถ้ามี)</label>
                  {/* All day toggle */}
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <span className="text-xs text-slate-500">ตลอดวัน</span>
                    <div
                      onClick={() => setFormData(prev => ({ ...prev, isAllDay: !prev.isAllDay }))}
                      className={`relative w-10 h-5 rounded-full transition-colors ${formData.isAllDay ? 'bg-indigo-500' : 'bg-slate-200'}`}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${formData.isAllDay ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </div>
                  </label>
                </div>

                <div className="space-y-2">
                  {/* Start row */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 w-10 shrink-0">เริ่ม</span>
                    <input
                      type="date"
                      value={formData.appointmentDate ? formData.appointmentDate.slice(0, 10) : ''}
                      onChange={(e) => {
                        const datePart = e.target.value
                        const hh = formData.appointmentDate ? formData.appointmentDate.slice(11, 13) : '09'
                        const mm = formData.appointmentDate ? formData.appointmentDate.slice(14, 16) : '00'
                        setFormData(prev => ({ ...prev, appointmentDate: datePart ? `${datePart}T${hh}:${mm}` : '' }))
                      }}
                      className="flex-1 px-3 py-2 border rounded-xl text-sm"
                    />
                    {!formData.isAllDay && (
                      <div className="flex items-center gap-1 shrink-0">
                        <input
                          type="number" min={0} max={23} placeholder="ชม."
                          value={formData.appointmentDate ? parseInt(formData.appointmentDate.slice(11, 13) || '9') : ''}
                          onChange={(e) => {
                            const hh = (isNaN(parseInt(e.target.value)) ? 0 : Math.max(0, Math.min(23, parseInt(e.target.value)))).toString().padStart(2, '0')
                            const datePart = formData.appointmentDate ? formData.appointmentDate.slice(0, 10) : new Date().toISOString().slice(0, 10)
                            const mm = formData.appointmentDate ? formData.appointmentDate.slice(14, 16) : '00'
                            setFormData(prev => ({ ...prev, appointmentDate: `${datePart}T${hh}:${mm}` }))
                          }}
                          className="w-12 px-1 py-2 border rounded-lg text-sm text-center"
                        />
                        <span className="text-slate-500">:</span>
                        <input
                          type="number" min={0} max={59} placeholder="นาที"
                          value={formData.appointmentDate ? parseInt(formData.appointmentDate.slice(14, 16) || '0') : ''}
                          onChange={(e) => {
                            const mm = (isNaN(parseInt(e.target.value)) ? 0 : Math.max(0, Math.min(59, parseInt(e.target.value)))).toString().padStart(2, '0')
                            const datePart = formData.appointmentDate ? formData.appointmentDate.slice(0, 10) : new Date().toISOString().slice(0, 10)
                            const hh = formData.appointmentDate ? formData.appointmentDate.slice(11, 13) : '09'
                            setFormData(prev => ({ ...prev, appointmentDate: `${datePart}T${hh}:${mm}` }))
                          }}
                          className="w-12 px-1 py-2 border rounded-lg text-sm text-center"
                        />
                        <span className="text-slate-500 text-xs">น.</span>
                      </div>
                    )}
                  </div>

                  {/* End row */}
                  {formData.appointmentDate && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 w-10 shrink-0">สิ้นสุด</span>
                      <input
                        type="date"
                        value={formData.appointmentEndDate ? formData.appointmentEndDate.slice(0, 10) : ''}
                        min={formData.appointmentDate ? formData.appointmentDate.slice(0, 10) : undefined}
                        onChange={(e) => {
                          const datePart = e.target.value
                          const hh = formData.appointmentEndDate ? formData.appointmentEndDate.slice(11, 13) : '17'
                          const mm = formData.appointmentEndDate ? formData.appointmentEndDate.slice(14, 16) : '00'
                          setFormData(prev => ({ ...prev, appointmentEndDate: datePart ? `${datePart}T${hh}:${mm}` : '' }))
                        }}
                        className="flex-1 px-3 py-2 border rounded-xl text-sm"
                      />
                      {!formData.isAllDay && (
                        <div className="flex items-center gap-1 shrink-0">
                          <input
                            type="number" min={0} max={23} placeholder="ชม."
                            value={formData.appointmentEndDate ? parseInt(formData.appointmentEndDate.slice(11, 13) || '17') : ''}
                            onChange={(e) => {
                              const hh = (isNaN(parseInt(e.target.value)) ? 0 : Math.max(0, Math.min(23, parseInt(e.target.value)))).toString().padStart(2, '0')
                              const datePart = formData.appointmentEndDate ? formData.appointmentEndDate.slice(0, 10) : (formData.appointmentDate ? formData.appointmentDate.slice(0, 10) : new Date().toISOString().slice(0, 10))
                              const mm = formData.appointmentEndDate ? formData.appointmentEndDate.slice(14, 16) : '00'
                              setFormData(prev => ({ ...prev, appointmentEndDate: `${datePart}T${hh}:${mm}` }))
                            }}
                            className="w-12 px-1 py-2 border rounded-lg text-sm text-center"
                          />
                          <span className="text-slate-500">:</span>
                          <input
                            type="number" min={0} max={59} placeholder="นาที"
                            value={formData.appointmentEndDate ? parseInt(formData.appointmentEndDate.slice(14, 16) || '0') : ''}
                            onChange={(e) => {
                              const mm = (isNaN(parseInt(e.target.value)) ? 0 : Math.max(0, Math.min(59, parseInt(e.target.value)))).toString().padStart(2, '0')
                              const datePart = formData.appointmentEndDate ? formData.appointmentEndDate.slice(0, 10) : (formData.appointmentDate ? formData.appointmentDate.slice(0, 10) : new Date().toISOString().slice(0, 10))
                              const hh = formData.appointmentEndDate ? formData.appointmentEndDate.slice(11, 13) : '17'
                              setFormData(prev => ({ ...prev, appointmentEndDate: `${datePart}T${hh}:${mm}` }))
                            }}
                            className="w-12 px-1 py-2 border rounded-lg text-sm text-center"
                          />
                          <span className="text-slate-500 text-xs">น.</span>
                        </div>
                      )}
                      {formData.appointmentEndDate && (
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, appointmentEndDate: '' }))}
                          className="text-slate-400 hover:text-red-400 text-xs shrink-0"
                        >✕</button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">สถานะ</label>
                <select
                  value={formData.status || 'new'}
                  onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as Status }))}
                  className="w-full px-3 py-2 border rounded-xl text-sm"
                >
                  {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                    <option key={key} value={key}>{config.icon} {config.label}</option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">หมายเหตุ</label>
                <input
                  type="text"
                  value={formData.notes || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-xl text-sm"
                  placeholder="หมายเหตุเพิ่มเติม"
                />
              </div>
            </div>

            <div className="sticky bottom-0 bg-white px-4 py-3 border-t flex gap-2">
              <button
                onClick={closeModal}
                className="flex-1 px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-sm font-medium"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSaving}
                className="flex-1 px-4 py-2 rounded-xl bg-blue-500 text-white text-sm font-medium disabled:opacity-50"
              >
                {isSaving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

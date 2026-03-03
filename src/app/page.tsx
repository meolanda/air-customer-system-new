'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'

// Types
type Department = 'admin' | 'quotation' | 'procurement'
type Status = 'new' | 'queue' | 'waiting_quote' | 'checking_parts' | 'send_quote' | 'waiting_response' | 'completed' | 'cancelled'

interface User {
  id: string
  name: string
  department: Department
}

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
  status: Status
  appointmentDate: string
  notes: string
  imageUrl: string
  history: { status: Status; date: string; by: string }[]
}

// Department config
const DEPARTMENTS: Record<Department, { name: string; icon: string; color: string }> = {
  admin: { name: 'ฝ่ายแอดมิน', icon: '👤', color: 'bg-blue-500' },
  quotation: { name: 'ฝ่ายทำใบเสนอราคา', icon: '📄', color: 'bg-green-500' },
  procurement: { name: 'ฝ่ายจัดซื้อ', icon: '🛒', color: 'bg-orange-500' }
}

// Status config - aligned with STATUS_WORKFLOW.ts
const STATUS_CONFIG: Record<Status, { label: string; icon: string; color: string; nextDepartment?: Department }> = {
  new: { label: 'รับเรื่องใหม่', icon: '📥', color: 'bg-slate-500', nextDepartment: undefined },
  queue: { label: 'จองคิว / นัดหมาย', icon: '📋', color: 'bg-yellow-500', nextDepartment: 'admin' },
  waiting_quote: { label: 'ขอใบเสนอราคา', icon: '💰', color: 'bg-orange-500', nextDepartment: 'quotation' },
  checking_parts: { label: 'เช็คอะไหล่ + เสนอราคา', icon: '🔧', color: 'bg-indigo-500', nextDepartment: 'procurement' },
  send_quote: { label: 'ส่งใบเสนอราคาแล้ว', icon: '📨', color: 'bg-teal-500', nextDepartment: 'admin' },
  waiting_response: { label: 'รอลูกค้าตอบกลับ', icon: '⏳', color: 'bg-amber-500', nextDepartment: 'admin' },
  completed: { label: 'เสร็จสิ้น', icon: '🏁', color: 'bg-gray-500', nextDepartment: undefined },
  cancelled: { label: 'ยกเลิก', icon: '❌', color: 'bg-red-500', nextDepartment: undefined }
}

// Sample users for login
const USERS: User[] = [
  { id: 'admin1', name: 'คุณสมชาย', department: 'admin' },
  { id: 'admin2', name: 'คุณสมหญิง', department: 'admin' },
  { id: 'admin3', name: 'คุณสมศักดิ์', department: 'admin' },
  { id: 'admin4', name: 'คุณสมศรี', department: 'admin' },
  { id: 'admin5', name: 'คุณสมบูรณ์', department: 'admin' },
  { id: 'admin6', name: 'คุณสมปอง', department: 'admin' },
  { id: 'quote1', name: 'คุณใบเสนอ', department: 'quotation' },
  { id: 'procure1', name: 'คุณจัดซื้อ', department: 'procurement' }
]

// Status transitions - aligned with STATUS_WORKFLOW.ts
const STATUS_TRANSITIONS: Record<Status, Status[]> = {
  new: ['queue', 'waiting_quote', 'checking_parts', 'cancelled'],
  queue: ['completed', 'cancelled'],
  waiting_quote: ['send_quote', 'cancelled'],
  checking_parts: ['send_quote', 'cancelled'],
  send_quote: ['waiting_response', 'cancelled'],
  waiting_response: ['new', 'cancelled'],
  completed: [],
  cancelled: []
}

// Which department handles which status - aligned with STATUS_WORKFLOW.ts
const STATUS_BY_DEPARTMENT: Record<Department, Status[]> = {
  admin: ['new', 'queue', 'send_quote', 'waiting_response', 'completed', 'cancelled'],
  quotation: ['waiting_quote'],
  procurement: ['checking_parts']
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRequest, setEditingRequest] = useState<ServiceRequest | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)

  // Form state
  const [formData, setFormData] = useState<Partial<ServiceRequest>>({
    channel: 'LINE',
    customerName: '',
    phone: '',
    address: '',
    serviceType: 'ล้างแอร์',
    description: '',
    priority: 'normal',
    status: 'new',
    appointmentDate: '',
    notes: '',
    imageUrl: ''
  })

  // Check if Google Sheets is configured
  const [isGoogleConfigured, setIsGoogleConfigured] = useState(false)

  // Load user from localStorage
  useEffect(() => {
    const savedUser = localStorage.getItem('currentUser')
    if (savedUser) setUser(JSON.parse(savedUser))
  }, [])

  // Fetch data from API
  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/sheets')
      const result = await response.json()

      if (result.data) {
        setRequests(result.data)
        setIsGoogleConfigured(true)
      } else {
        // Fallback to localStorage if Google Sheets not configured
        const savedRequests = localStorage.getItem('serviceRequests')
        if (savedRequests) {
          setRequests(JSON.parse(savedRequests))
        }
        setIsGoogleConfigured(false)
      }
    } catch (error) {
      console.error('Error fetching data:', error)
      // Fallback to localStorage
      const savedRequests = localStorage.getItem('serviceRequests')
      if (savedRequests) {
        setRequests(JSON.parse(savedRequests))
      }
      setIsGoogleConfigured(false)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user) {
      fetchData()
    }
  }, [user, fetchData])

  // Save to localStorage as backup
  useEffect(() => {
    if (requests.length > 0) {
      localStorage.setItem('serviceRequests', JSON.stringify(requests))
    }
  }, [requests])

  // Login
  const handleLogin = (selectedUser: User) => {
    setUser(selectedUser)
    localStorage.setItem('currentUser', JSON.stringify(selectedUser))
  }

  // Logout
  const handleLogout = () => {
    setUser(null)
    localStorage.removeItem('currentUser')
  }

  // Generate request number
  const generateRequestNo = () => {
    const date = new Date()
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '')
    const count = requests.filter(r => r.requestNo.includes(dateStr)).length + 1
    return `REQ-${dateStr}-${count.toString().padStart(3, '0')}`
  }

  // Upload image to Google Drive
  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      setUploadProgress(0)
      const formDataUpload = new FormData()
      formDataUpload.append('file', file)

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formDataUpload,
      })

      const result = await response.json()
      setUploadProgress(100)

      if (result.success && result.data?.url) {
        return result.data.url
      }
      return null
    } catch (error) {
      console.error('Error uploading image:', error)
      return null
    } finally {
      setTimeout(() => setUploadProgress(null), 1000)
    }
  }

  // Filter requests by department
  const departmentRequests = useMemo(() => {
    if (!user) return []

    let filtered = requests

    // Filter by department
    if (user.department !== 'admin') {
      const allowedStatuses = STATUS_BY_DEPARTMENT[user.department]
      filtered = filtered.filter(r => allowedStatuses.includes(r.status))
    }

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

    const allowedStatuses = STATUS_BY_DEPARTMENT[user.department]
    const deptRequests = user.department === 'admin'
      ? requests
      : requests.filter(r => allowedStatuses.includes(r.status))

    const todoStatuses = ['new', 'queue', 'waiting_quote', 'checking_parts', 'send_quote', 'waiting_response']

    return {
      total: deptRequests.length,
      todo: deptRequests.filter(r => todoStatuses.includes(r.status)).length,
      done: deptRequests.filter(r => r.status === 'completed').length
    }
  }, [requests, user])

  // Handle form
  const handleSubmit = async () => {
    if (!formData.customerName || !formData.phone) {
      alert('กรุณากรอกชื่อลูกค้าและเบอร์โทร')
      return
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

        // Try API first
        if (isGoogleConfigured) {
          const res = await fetch('/api/sheets', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedRequest)
          })
          if (!res.ok) throw new Error('API error')
        }

        setRequests(prev => prev.map(r => r.id === editingRequest.id ? updatedRequest : r))
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
          notes: formData.notes || '',
          imageUrl: formData.imageUrl || '',
          history: [{ status: 'new', date: new Date().toISOString(), by: user?.name || 'System' }]
        }

        // Try API first
        if (isGoogleConfigured) {
          const res = await fetch('/api/sheets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newRequest)
          })
          if (!res.ok) throw new Error('API error')
        }

        setRequests(prev => [newRequest, ...prev])
      }
      closeModal()
    } catch (error) {
      console.error('Error saving:', error)
      alert('บันทึกไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setIsSaving(false)
    }
  }

  const openModal = (request?: ServiceRequest) => {
    if (request) {
      setEditingRequest(request)
      setFormData(request)
    } else {
      setEditingRequest(null)
      setFormData({
        channel: 'LINE',
        customerName: '',
        phone: '',
        address: '',
        serviceType: 'ล้างแอร์',
        description: '',
        priority: 'normal',
        status: 'new',
        appointmentDate: '',
        notes: '',
        imageUrl: ''
      })
    }
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingRequest(null)
    setUploadProgress(null)
  }

  const updateStatus = async (id: string, newStatus: Status) => {
    const request = requests.find(r => r.id === id)
    if (!request) return

    const updatedRequest = {
      ...request,
      status: newStatus,
      history: [...request.history, { status: newStatus, date: new Date().toISOString(), by: user?.name || 'System' }]
    }

    try {
      if (isGoogleConfigured) {
        const res = await fetch('/api/sheets', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedRequest)
        })
        if (!res.ok) throw new Error('API error')
      }
      setRequests(prev => prev.map(r => r.id === id ? updatedRequest : r))
    } catch (error) {
      console.error('Error updating status:', error)
      alert('อัปเดตสถานะไม่สำเร็จ กรุณาลองใหม่')
    }
  }

  const deleteRequest = async (id: string) => {
    if (!confirm('ยืนยันการลบรายการนี้?')) return

    try {
      if (isGoogleConfigured) {
        const res = await fetch(`/api/sheets?id=${id}`, { method: 'DELETE' })
        if (!res.ok) throw new Error('API error')
      }
      setRequests(prev => prev.filter(r => r.id !== id))
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

    const url = await uploadImage(file)
    if (url) {
      setFormData(prev => ({ ...prev, imageUrl: url }))
    } else {
      alert('อัปโหลดรูปไม่สำเร็จ')
    }
  }

  // === LOGIN SCREEN ===
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-blue-500 rounded-2xl flex items-center justify-center text-4xl mx-auto mb-4 shadow-lg">
              ❄️
            </div>
            <h1 className="text-2xl font-bold text-slate-800">ระบบรับงานบริการแอร์</h1>
            <p className="text-slate-500 mt-2">เลือกผู้ใช้เพื่อเข้าสู่ระบบ</p>
          </div>

          <div className="space-y-3">
            <div className="bg-blue-50 rounded-xl p-3">
              <p className="text-sm font-medium text-blue-700 mb-2">👤 ฝ่ายแอดมิน (6 คน)</p>
              <div className="grid grid-cols-2 gap-2">
                {USERS.filter(u => u.department === 'admin').map(u => (
                  <button
                    key={u.id}
                    onClick={() => handleLogin(u)}
                    className="bg-white hover:bg-blue-100 text-slate-700 px-4 py-3 rounded-xl text-sm font-medium transition-all border border-blue-200"
                  >
                    {u.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-green-50 rounded-xl p-3">
              <p className="text-sm font-medium text-green-700 mb-2">📄 ฝ่ายทำใบเสนอราคา (1 คน)</p>
              {USERS.filter(u => u.department === 'quotation').map(u => (
                <button
                  key={u.id}
                  onClick={() => handleLogin(u)}
                  className="w-full bg-white hover:bg-green-100 text-slate-700 px-4 py-3 rounded-xl text-sm font-medium transition-all border border-green-200"
                >
                  {u.name}
                </button>
              ))}
            </div>

            <div className="bg-orange-50 rounded-xl p-3">
              <p className="text-sm font-medium text-orange-700 mb-2">🛒 ฝ่ายจัดซื้อ (1 คน)</p>
              {USERS.filter(u => u.department === 'procurement').map(u => (
                <button
                  key={u.id}
                  onClick={() => handleLogin(u)}
                  className="w-full bg-white hover:bg-orange-100 text-slate-700 px-4 py-3 rounded-xl text-sm font-medium transition-all border border-orange-200"
                >
                  {u.name}
                </button>
              ))}
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
                <p className="text-xs text-slate-500">
                  {DEPARTMENTS[user.department].icon} {user.name} • {DEPARTMENTS[user.department].name}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Storage indicator */}
              <div className={`px-2 py-1 rounded-lg text-xs font-medium ${isGoogleConfigured ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                {isGoogleConfigured ? '☁️ Google Sheets' : '💾 Local Storage'}
              </div>
              {user.department === 'admin' && (
                <button
                  onClick={() => openModal()}
                  className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-1"
                >
                  <span>+</span> เพิ่มงาน
                </button>
              )}
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
          <div className="flex gap-2">
            <div className="flex-1 relative">
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
            <button
              onClick={fetchData}
              className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 hover:bg-slate-100"
              title="รีเฟรชข้อมูล"
            >
              🔄
            </button>
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
        ) : (
          <div className="space-y-3">
            {departmentRequests.map((request) => (
              <div key={request.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className="text-xs font-mono text-blue-600">{request.requestNo}</span>
                    <span className="mx-2 text-slate-300">|</span>
                    <span className="text-xs text-slate-500">{formatDate(request.createdAt)}</span>
                  </div>
                  <span className={`px-2 py-1 rounded-lg text-xs font-medium text-white ${STATUS_CONFIG[request.status].color}`}>
                    {STATUS_CONFIG[request.status].icon} {STATUS_CONFIG[request.status].label}
                  </span>
                </div>

                <div className="mb-3">
                  <div className="font-semibold text-slate-800">{request.customerName}</div>
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
                      className={`px-3 py-2 rounded-xl text-xs font-medium text-white ${STATUS_CONFIG[nextStatus].color} hover:opacity-90 transition-all`}
                    >
                      {STATUS_CONFIG[nextStatus].icon} {STATUS_CONFIG[nextStatus].label}
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
                          {STATUS_CONFIG[h.status].icon} {h.status === 'new' ? 'เริ่มต้น' : STATUS_CONFIG[h.status].label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
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
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">ชื่อลูกค้า *</label>
                  <input
                    type="text"
                    value={formData.customerName || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, customerName: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-xl text-sm"
                    placeholder="ชื่อ-นามสกุล"
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
                <label className="block text-sm font-medium text-slate-700 mb-1">ที่อยู่</label>
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

'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('App error:', error.digest || error.message)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200 text-center max-w-md">
        <div className="text-5xl mb-4">⚠️</div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">เกิดข้อผิดพลาด</h2>
        <p className="text-slate-500 mb-6 text-sm">ระบบพบปัญหาชั่วคราว กรุณาลองใหม่อีกครั้ง</p>
        <button
          onClick={reset}
          className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-xl font-medium transition-colors"
        >
          ลองใหม่
        </button>
      </div>
    </div>
  )
}

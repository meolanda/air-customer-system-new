import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ระบบรับงานบริการแอร์',
    short_name: 'งานแอร์',
    description: 'จัดการงานซ่อม ล้าง และติดตั้งแอร์',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f8fafc',
    theme_color: '#3b82f6',
    lang: 'th',
    icons: [
      { src: '/pwa-icon?size=192', sizes: '192x192', type: 'image/png' },
      { src: '/pwa-icon?size=512', sizes: '512x512', type: 'image/png' },
      { src: '/pwa-icon?size=512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}

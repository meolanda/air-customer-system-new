import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ระบบรับงานบริการแอร์",
  description: "ระบบรับงานบริการสำหรับช่างแอร์ จัดการงานซ่อม ล้าง และติดตั้ง",
  keywords: ["ระบบลูกค้า", "ช่างแอร์", "บริการแอร์", "Next.js", "TypeScript"],
  authors: [{ name: "Aircon Service Team" }],
  appleWebApp: { capable: true, title: "งานแอร์", statusBarStyle: "default" },
  icons: { icon: "/pwa-icon?size=192", apple: "/pwa-icon?size=180" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#3b82f6",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}

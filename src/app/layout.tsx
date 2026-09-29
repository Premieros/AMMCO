import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AMMCO | Branch Intelligence',
  description: 'لوحة متابعة وتحليل شيتات فروع AMMCO',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  )
}

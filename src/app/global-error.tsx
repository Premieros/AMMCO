'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('ammco-global-error', error)
  }, [error])

  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, minHeight: '100vh', background: '#f3f6fb' }}>
        <main
          style={{
            maxWidth: 760,
            margin: '48px auto',
            padding: 24,
            textAlign: 'right',
            fontFamily: 'Arial, sans-serif',
          }}
        >
          <h2>حدث خطأ غير متوقع في النظام</h2>
          <p>يرجى إعادة المحاولة. إذا استمرت المشكلة، تواصل مع مسؤول النظام.</p>
          {error?.digest && (
            <p style={{ fontSize: 12, color: '#64748b' }}>
              Reference: {error.digest}
            </p>
          )}
          <button type="button" onClick={() => reset()}>
            إعادة المحاولة
          </button>
        </main>
      </body>
    </html>
  )
}

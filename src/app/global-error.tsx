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

  const boxStyle = {
    maxWidth: 820,
    margin: '48px auto',
    padding: 24,
    border: '1px solid #7f1d1d',
    borderRadius: 16,
    background: '#0f172a',
    color: '#fff',
    fontFamily: 'Arial, sans-serif',
    direction: 'rtl' as const,
  }

  const codeStyle = {
    display: 'block',
    whiteSpace: 'pre-wrap' as const,
    overflowWrap: 'anywhere' as const,
    padding: 14,
    marginTop: 8,
    borderRadius: 10,
    background: '#020617',
    color: '#fecaca',
    textAlign: 'left' as const,
    direction: 'ltr' as const,
    fontSize: 13,
  }

  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, minHeight: '100vh', background: '#020617' }}>
        <main style={boxStyle}>
          <h2 style={{ marginTop: 0 }}>حدث خطأ غير متوقع في النظام</h2>
          <p style={{ color: '#cbd5e1' }}>
            أرسل صورة لهذه الشاشة؛ التفاصيل بالأسفل ستحدد سبب الخطأ مباشرة.
          </p>

          <div style={{ marginTop: 18 }}>
            <strong>رسالة الخطأ</strong>
            <code style={codeStyle}>{error?.message || 'Unknown error'}</code>
          </div>

          {error?.digest && (
            <div style={{ marginTop: 18 }}>
              <strong>Digest</strong>
              <code style={codeStyle}>{error.digest}</code>
            </div>
          )}

          {error?.stack && (
            <details style={{ marginTop: 18 }}>
              <summary style={{ cursor: 'pointer' }}>Stack trace</summary>
              <code style={codeStyle}>{error.stack}</code>
            </details>
          )}

          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: 20,
              padding: '10px 18px',
              border: 0,
              borderRadius: 8,
              background: '#059669',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            إعادة المحاولة
          </button>
        </main>
      </body>
    </html>
  )
}

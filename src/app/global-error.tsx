'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-slate-950 text-white">
          <h2 className="text-xl font-bold mb-4">حدث خطأ غير متوقع في النظام</h2>
          <p className="text-slate-400 mb-6 text-sm">يرجى المحاولة مرة أخرى أو مراجعة مسؤول النظام</p>
          <button
            type="button"
            onClick={() => reset()}
            className="px-5 py-2.5 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition"
          >
            إعادة المحاولة
          </button>
        </div>
      </body>
    </html>
  )
}

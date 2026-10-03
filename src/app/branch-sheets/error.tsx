'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function BranchSheetsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('branch-sheets-error', error)
  }, [error])

  return (
    <main dir="rtl" className="min-h-screen bg-slate-950 text-white p-6">
      <div className="max-w-2xl mx-auto mt-16 rounded-2xl border border-rose-800 bg-slate-900 p-6">
        <h1 className="text-xl font-bold mb-3">تعذر فتح صفحة شيتات الفروع</h1>
        <p className="text-slate-300 mb-4">
          ظهرت رسالة خطأ داخل الصفحة. انسخ النص التالي أو أرسل صورة له.
        </p>

        <div className="rounded-lg bg-black/40 border border-slate-700 p-4 mb-4">
          <div className="text-xs text-slate-400 mb-1">الخطأ</div>
          <pre className="whitespace-pre-wrap break-words text-sm text-rose-200">
            {error.message || 'Unknown error'}
          </pre>
          {error.digest && (
            <>
              <div className="text-xs text-slate-400 mt-3 mb-1">Digest</div>
              <code className="text-xs text-amber-200">{error.digest}</code>
            </>
          )}
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={() => reset()} className="btn btn-primary-action">
            إعادة المحاولة
          </button>
          <Link href="/branch-sheets" className="btn btn-secondary-action">
            فتح الصفحة بدون رابط قديم
          </Link>
          <Link href="/imports" className="btn btn-secondary-action">
            الرجوع لسجل الرفع
          </Link>
        </div>
      </div>
    </main>
  )
}

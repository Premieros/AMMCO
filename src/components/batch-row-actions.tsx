'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileEdit, RefreshCw, Trash2, ExternalLink, AlertTriangle } from 'lucide-react'

interface Props {
  batchId: string
  branchId: string
  branchName: string
  periodStart: string
  periodEnd: string
  version: number
  isAdmin?: boolean
}

export function BatchRowActions({
  batchId,
  branchId,
  branchName,
  periodStart,
  periodEnd,
  version,
  isAdmin = true,
}: Props) {
  const router = useRouter()
  const [showConfirm, setShowConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/imports/${batchId}/delete`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل حذف الشيت')

      setShowConfirm(false)
      router.refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'فشل حذف الشيت')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
        <Link
          href={`/branch-sheets?branch=${branchId}&batch=${batchId}`}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors border border-blue-200"
          title="عرض محتويات الشيت وتعديلها"
        >
          <FileEdit className="w-3.5 h-3.5" />
          <span>تعديل المحتوى</span>
        </Link>

        <Link
          href={`/uploads?branch=${branchId}&period_start=${periodStart}&period_end=${periodEnd}&replace_batch_id=${batchId}&mode=replace`}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded bg-sky-50 text-sky-700 hover:bg-sky-100 transition-colors border border-sky-200"
          title="استبدال هذا الشيت بملف Excel جديد"
        >
          <RefreshCw className="w-3.5 h-3.5 text-sky-600" />
          <span>استبدال</span>
        </Link>

        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors border border-rose-200"
            title="حذف هذا الشيت بالكامل"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>حذف</span>
          </button>
        )}

        <Link
          href={`/imports/${batchId}`}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
          title="عرض تقرير المراجعة والاعتماد"
        >
          <span>تفاصيل</span>
        </Link>
      </div>

      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          onClick={(e) => {
            e.stopPropagation()
            if (!deleting) setShowConfirm(false)
          }}
          dir="rtl"
        >
          <div
            className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0 text-rose-600">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">تأكيد حذف الشيت نهائياً</h3>
                <p className="text-xs text-slate-500">هذا الإجراء سيقوم بتطهير كافة السجلات المرتبطة</p>
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-sm mb-4 space-y-1">
              <div>الفرع: <strong className="text-slate-800">{branchName}</strong></div>
              <div>الفترة: <strong className="text-slate-800">{periodStart} إلى {periodEnd}</strong></div>
              <div>الإصدار: <strong className="text-slate-800">v{version}</strong></div>
            </div>

            <p className="text-xs text-rose-600 mb-6 leading-relaxed">
              تحذير: سيتم حذف كافة بيانات المبيعات والمخزن ويومية الخزينة المسجلة في هذا الشيت نهائياً. وإذا كان معتمداً، سيتم استرجاع الإصدار السابق المعتمد تلقائياً.
            </p>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                onClick={() => setShowConfirm(false)}
                disabled={deleting}
              >
                إلغاء
              </button>
              <button
                type="button"
                className="px-4 py-2 text-sm font-bold rounded-lg bg-rose-600 text-white hover:bg-rose-700 shadow-sm transition-colors flex items-center gap-1.5"
                onClick={handleDelete}
                disabled={deleting}
              >
                <Trash2 className="w-4 h-4" />
                <span>{deleting ? 'جاري الحذف...' : 'نعم، احذف الشيت'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

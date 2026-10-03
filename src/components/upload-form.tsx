'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { RefreshCw, Upload, CheckCircle2, AlertTriangle, FileEdit, ArrowRight } from 'lucide-react'

type Branch = { id: string; name: string; code: string }

interface Props {
  branches: Branch[]
  defaultBranch?: string
  defaultPeriodStart?: string
  defaultPeriodEnd?: string
  replaceBatchId?: string
  isReplaceMode?: boolean
}

export function UploadForm({
  branches,
  defaultBranch = '',
  defaultPeriodStart = '',
  defaultPeriodEnd = '',
  replaceBatchId,
  isReplaceMode = false,
}: Props) {
  const router = useRouter()
  const [selectedBranch, setSelectedBranch] = useState(defaultBranch)
  const [periodStart, setPeriodStart] = useState(defaultPeriodStart)
  const [periodEnd, setPeriodEnd] = useState(defaultPeriodEnd)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploadedBatchId, setUploadedBatchId] = useState<string | null>(null)

  const activeBranchName = branches.find((b) => b.id === selectedBranch)?.name

  async function submit(formData: FormData) {
    setBusy(true)
    setMessage(null)
    setError(null)

    try {
      if (replaceBatchId) {
        formData.append('replace_batch_id', replaceBatchId)
        formData.append('history_mode', 'replace')
      }

      const uploadResponse = await fetch('/api/imports/upload', {
        method: 'POST',
        body: formData,
      })
      const upload = await uploadResponse.json()

      if (!uploadResponse.ok) {
        throw new Error(upload.error || 'تعذر رفع الملف')
      }

      setUploadedBatchId(upload.batchId)
      setMessage(`تم رفع الملف بنجاح كإصدار v${upload.version}. جاري تحليل ومعالجة محتوى الشيت...`)

      const processResponse = await fetch(`/api/imports/${upload.batchId}/process`, {
        method: 'POST',
      })
      const processed = await processResponse.json()

      if (!processResponse.ok) {
        throw new Error(processed.error || 'تم رفع الملف لكن تعذر تحليل محتواه')
      }

      if (processed.status === 'rejected') {
        setMessage(
          `تم حفظ ومعالجة الملف، لكنه يحتاج مراجعة: تم رصد ${processed.issues} ملاحظة تحقق.`
        )
      } else {
        setMessage(
          isReplaceMode
            ? `تم استبدال شيت ${activeBranchName || ''} بنجاح بالإصدار v${upload.version}: تم تحليل ${processed.sheets} صفحة وتسجيل ${processed.rows} صف.`
            : `تم رفع وتحليل الإصدار v${upload.version} بنجاح: ${processed.sheets} صفحة و${processed.rows} صف محفوظ.`
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر رفع الملف')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card max-w-3xl mx-auto">
      {isReplaceMode ? (
        <div className="p-4 mb-5 rounded-xl bg-sky-50 border border-sky-200 text-sky-900 flex items-start gap-3">
          <RefreshCw className="w-5 h-5 text-sky-600 mt-0.5 flex-shrink-0 animate-spin-reverse" />
          <div className="text-sm">
            <strong className="block font-bold mb-1 text-sky-950">
              أنت الآن في وضع استبدال الشيت المباشر
            </strong>
            <p className="text-sky-800 leading-relaxed">
              الملف الجديد سيحل محل الإصدار السابق لفرع{' '}
              <strong>{activeBranchName || 'المحدد'}</strong> للفترة من{' '}
              <strong>{periodStart || '—'}</strong> إلى <strong>{periodEnd || '—'}</strong>. سيتم
              تحديث وحساب كافة تقارير المبيعات والمخزن والخزينة تلقائياً بناءً على محتوى الملف
              الجديد.
            </p>
          </div>
        </div>
      ) : (
        <div className="notice mb-5">
          يقبل النظام ملفات .xlsx فقط وبحد أقصى 25MB. إعادة رفع نفس الملف لن تضاعف البيانات.
        </div>
      )}

      {message && (
        <div className="p-4 mb-5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex flex-col gap-3">
          <div className="flex items-center gap-2 font-bold">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <span>{message}</span>
          </div>

          {uploadedBatchId && (
            <div className="flex items-center gap-3 mt-2 flex-wrap pt-2 border-t border-emerald-200/60">
              <Link
                href={`/branch-sheets?branch=${selectedBranch}&batch=${uploadedBatchId}`}
                className="btn btn-primary-action text-xs"
              >
                <FileEdit className="w-4 h-4" />
                <span>عرض وتعديل محتويات هذا الشيت الآن</span>
              </Link>
              <Link href="/imports" className="btn btn-secondary-action text-xs">
                <span>سجل الرفع والاعتماد</span>
              </Link>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="p-4 mb-5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form className="form" action={submit}>
        <div className="field">
          <label htmlFor="branch_id">الفرع</label>
          <select
            id="branch_id"
            name="branch_id"
            required
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
          >
            <option value="" disabled>
              اختر الفرع
            </option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="field">
            <label htmlFor="period_start">بداية الفترة</label>
            <input
              id="period_start"
              name="period_start"
              type="date"
              required
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="period_end">نهاية الفترة</label>
            <input
              id="period_end"
              name="period_end"
              type="date"
              required
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="file">
            {isReplaceMode ? 'ملف Excel الجديد (البديل)' : 'ملف Excel'}
          </label>
          <input
            id="file"
            name="file"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            required
            className="file-input-field"
          />
          <small className="text-slate-500 mt-1 block">
            صيغة .xlsx المعتمدة لشيت الفرع (يومي + مناديب + مخزن + خزينة)
          </small>
        </div>

        <div className="flex items-center gap-3 pt-3">
          <button
            className={`btn ${isReplaceMode ? 'btn-primary-action' : 'btn-primary-action'}`}
            type="submit"
            disabled={busy}
          >
            {busy ? (
              <span className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>جاري الرفع والتحليل...</span>
              </span>
            ) : isReplaceMode ? (
              <span className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4" />
                <span>رفع واستبدال الشيت الآن</span>
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Upload className="w-4 h-4" />
                <span>رفع وتحليل الشيت</span>
              </span>
            )}
          </button>

          <Link href="/branch-sheets" className="btn btn-secondary-action">
            <span>إلغاء والعودة لشيتات الفروع</span>
          </Link>
        </div>
      </form>
    </section>
  )
}

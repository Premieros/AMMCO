'use client'

import { useState } from 'react'

type Branch = { id: string; name: string; code: string }

export function UploadForm({ branches }: { branches: Branch[] }) {
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(formData: FormData) {
    setBusy(true)
    setMessage(null)
    setError(null)

    try {
      const uploadResponse = await fetch('/api/imports/upload', {
        method: 'POST',
        body: formData,
      })
      const upload = await uploadResponse.json()

      if (!uploadResponse.ok) {
        throw new Error(upload.error || 'تعذر رفع الملف')
      }

      setMessage(`تم رفع الإصدار ${upload.version}. جاري تحليل محتوى الشيت...`)

      const processResponse = await fetch(`/api/imports/${upload.batchId}/process`, {
        method: 'POST',
      })
      const processed = await processResponse.json()

      if (!processResponse.ok) {
        throw new Error(
          processed.error || 'تم رفع الملف لكن تعذر تحليل محتواه',
        )
      }

      if (processed.status === 'rejected') {
        setMessage(
          `تم حفظ الملف، لكنه يحتاج مراجعة: ${processed.issues} ملاحظة تحقق.`,
        )
      } else {
        setMessage(
          `تم رفع وتحليل الإصدار ${upload.version} بنجاح: ${processed.sheets} صفحة و${processed.rows} صف محفوظ.`,
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر رفع الملف')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <div className="notice" style={{ marginBottom: 16 }}>
        يقبل النظام ملفات .xlsx فقط وبحد أقصى 25MB. إعادة رفع نفس الملف لن تضاعف البيانات.
      </div>
      {message ? <div className="success" style={{ marginBottom: 14 }}>{message}</div> : null}
      {error ? <div className="error" style={{ marginBottom: 14 }}>{error}</div> : null}

      <form className="form" action={submit}>
        <div className="field">
          <label htmlFor="branch_id">الفرع</label>
          <select id="branch_id" name="branch_id" required defaultValue="">
            <option value="" disabled>اختر الفرع</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="period_start">بداية الفترة</label>
          <input id="period_start" name="period_start" type="date" required />
        </div>

        <div className="field">
          <label htmlFor="period_end">نهاية الفترة</label>
          <input id="period_end" name="period_end" type="date" required />
        </div>

        <div className="field">
          <label htmlFor="file">ملف Excel</label>
          <input
            id="file"
            name="file"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            required
          />
        </div>

        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'جاري الرفع والتحليل...' : 'رفع وتحليل الشيت'}
        </button>
      </form>
    </section>
  )
}

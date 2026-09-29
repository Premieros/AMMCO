import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const statusLabel: Record<string, string> = {
  uploaded: 'مرفوع',
  processing: 'قيد التحليل',
  validated: 'تم التحقق',
  approved: 'معتمد',
  rejected: 'مرفوض',
  failed: 'فشل',
  superseded: 'نسخة سابقة',
}

export default async function ImportsPage() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  if (!auth?.claims?.sub) redirect('/login')

  const { data } = await supabase
    .from('import_batches')
    .select('id, original_file_name, period_start, period_end, version, status, uploaded_at, branches(name)')
    .order('uploaded_at', { ascending: false })
    .limit(100)

  return (
    <AppShell title="سجل الرفع" subtitle="كل نسخة مرفوعة محفوظة وقابلة للتتبع">
      <section className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>الفرع</th><th>الفترة</th><th>الملف</th><th>الإصدار</th><th>الحالة</th><th>وقت الرفع</th></tr></thead>
            <tbody>
              {(data ?? []).map((row) => {
                const branch = Array.isArray(row.branches) ? row.branches[0] : row.branches
                return (
                  <tr key={row.id}>
                    <td>{branch?.name ?? '-'}</td>
                    <td>{row.period_start} — {row.period_end}</td>
                    <td>{row.original_file_name}</td>
                    <td>{row.version}</td>
                    <td>{statusLabel[row.status] ?? row.status}</td>
                    <td>{new Date(row.uploaded_at).toLocaleString('ar-EG')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  )
}

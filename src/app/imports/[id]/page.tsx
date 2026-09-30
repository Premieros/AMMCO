import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { createClient } from '@/lib/supabase/server'
import { approveImport } from '../actions'

export const dynamic = 'force-dynamic'

function changedSections(oldSnapshot: unknown, newSnapshot: unknown) {
  const oldValue = (oldSnapshot && typeof oldSnapshot === 'object' ? oldSnapshot : {}) as Record<string, unknown>
  const newValue = (newSnapshot && typeof newSnapshot === 'object' ? newSnapshot : {}) as Record<string, unknown>
  const labels: Record<string, string> = {
    reps: 'المناديب',
    remittances: 'التوريدات',
    warehouse: 'حركة المخزن',
    treasury: 'الخزنة',
  }

  return Object.keys(labels)
    .filter((key) => JSON.stringify(oldValue[key] ?? null) !== JSON.stringify(newValue[key] ?? null))
    .map((key) => labels[key])
}

export default async function ImportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { id } = await params
  const messages = await searchParams
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims?.sub
  if (!userId) redirect('/login')

  const [{ data: profile }, { data: batch }] = await Promise.all([
    supabase.from('profiles').select('role').eq('user_id', userId).maybeSingle(),
    supabase
      .from('import_batches')
      .select('*,branches(name)')
      .eq('id', id)
      .maybeSingle(),
  ])

  if (!batch || !profile) notFound()

  const [{ data: changes }, { data: issues }, { data: snapshots }] = await Promise.all([
    supabase.from('import_day_changes').select('*').eq('batch_id', id).order('business_date'),
    supabase.from('import_validation_issues').select('*').eq('batch_id', id).order('id'),
    supabase.from('import_day_snapshots').select('business_date,source_hash').eq('batch_id', id).order('business_date'),
  ])

  const branch = Array.isArray(batch.branches) ? batch.branches[0] : batch.branches
  const canApprove = profile.role === 'admin' && batch.status === 'validated' && (changes ?? []).length === 0

  return (
    <AppShell
      title="مراجعة نسخة الشيت"
      subtitle={`${branch?.name ?? '-'} · إصدار ${batch.version} · رفع ${new Date(batch.uploaded_at).toLocaleString('en-GB')}`}
      breadcrumbs={[
        { label: 'لوحة الإدارة', href: '/' },
        { label: 'سجل الرفع', href: '/imports' },
        { label: `الإصدار ${batch.version}` },
      ]}
      actions={<Link className="btn secondary" href="/imports">رجوع</Link>}
    >
      {messages.error ? <div className="error">{messages.error}</div> : null}
      {messages.success ? <div className="success">{messages.success}</div> : null}

      <section className="grid portal-kpis" style={{ marginBottom: 16 }}>
        <div className="card"><div className="kpi-label">الحالة</div><div className="kpi-value small-value">{batch.status}</div></div>
        <div className="card"><div className="kpi-label">أيام داخل الملف</div><div className="kpi-value">{snapshots?.length ?? 0}</div></div>
        <div className="card"><div className="kpi-label">تعديلات تاريخية</div><div className="kpi-value">{changes?.length ?? 0}</div></div>
        <div className="card"><div className="kpi-label">ملاحظات تحقق</div><div className="kpi-value">{issues?.length ?? 0}</div></div>
      </section>

      {(changes ?? []).length > 0 ? (
        <section className="card" style={{ marginBottom: 16 }}>
          <div className="section-head">
            <div>
              <h2>تم اكتشاف تعديل على أيام سبق إرسالها</h2>
              <p className="muted">هذه النسخة لا تؤثر على التقارير المعتمدة. راجع الأيام التالية.</p>
            </div>
            <span className="pill">{changes?.length ?? 0} يوم</span>
          </div>
          <div className="table-wrap enterprise-table">
            <table>
              <thead><tr><th>اليوم</th><th>ما الذي تغير</th><th>النسخة السابقة</th><th>الحالة</th></tr></thead>
              <tbody>
                {(changes ?? []).map((change) => (
                  <tr key={change.id}>
                    <td>{change.business_date}</td>
                    <td>{changedSections(change.old_snapshot, change.new_snapshot).join('، ') || 'تغيير في محتوى اليوم'}</td>
                    <td dir="ltr">{String(change.previous_batch_id).slice(0, 8)}</td>
                    <td>{change.resolution_status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {(issues ?? []).length > 0 ? (
        <section className="card" style={{ marginBottom: 16 }}>
          <div className="section-head"><h2>ملاحظات التحقق</h2></div>
          <div className="table-wrap enterprise-table">
            <table>
              <thead><tr><th>الصفحة/اليوم</th><th>الكود</th><th>الدرجة</th><th>الرسالة</th></tr></thead>
              <tbody>
                {(issues ?? []).map((issue) => (
                  <tr key={issue.id}>
                    <td>{issue.sheet_name ?? '-'}</td>
                    <td>{issue.code}</td>
                    <td>{issue.severity}</td>
                    <td>{issue.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {canApprove ? (
        <section className="card">
          <div className="section-head">
            <div><h2>اعتماد النسخة</h2><p className="muted">سيتم تثبيت الأيام الجديدة كمرجع رسمي واستبدال النسخة السابقة لنفس الفترة.</p></div>
          </div>
          <form action={approveImport}>
            <input type="hidden" name="batch_id" value={id} />
            <button className="btn" type="submit">اعتماد النسخة</button>
          </form>
        </section>
      ) : null}
    </AppShell>
  )
}

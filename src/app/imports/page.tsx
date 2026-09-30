import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { SmartTable } from '@/components/smart-table'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const statusLabel: Record<string, string> = {
  uploaded: 'مرفوع',
  processing: 'قيد التحليل',
  validated: 'جاهز للاعتماد',
  approved: 'معتمد',
  rejected: 'مرفوض / يحتاج مراجعة',
  failed: 'فشل',
  superseded: 'نسخة سابقة',
}

export default async function ImportsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const messages = await searchParams
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  if (!auth?.claims?.sub) redirect('/login')

  const [{ data: batches }, { data: changes }] = await Promise.all([
    supabase
      .from('import_batches')
      .select('id,branch_id,original_file_name,period_start,period_end,version,status,uploaded_at,validated_at,approved_at,branches(name)')
      .order('uploaded_at', { ascending: false })
      .limit(300),
    supabase.from('import_day_changes').select('batch_id,business_date,resolution_status'),
  ])

  const changeCount = new Map<string, number>()
  for (const row of changes ?? []) changeCount.set(row.batch_id, (changeCount.get(row.batch_id) ?? 0) + 1)

  const rows = (batches ?? []).map((row) => {
    const branch = Array.isArray(row.branches) ? row.branches[0] : row.branches
    return {
      href: `/imports/${row.id}`,
      branch_name: branch?.name ?? '-',
      period: `${row.period_start} — ${row.period_end}`,
      file: row.original_file_name,
      version: row.version,
      status: statusLabel[row.status] ?? row.status,
      historical_changes: changeCount.get(row.id) ?? 0,
      uploaded_at: new Date(row.uploaded_at).toLocaleString('en-GB'),
      approved_at: row.approved_at ? new Date(row.approved_at).toLocaleString('en-GB') : '',
    }
  })

  return (
    <AppShell
      title="سجل الرفع"
      subtitle="كل نسخة محفوظة بتاريخ رفعها، وأي تعديل على يوم سابق يظهر هنا قبل الاعتماد"
      breadcrumbs={[{ label: 'لوحة الإدارة', href: '/' }, { label: 'سجل الرفع' }]}
      actions={<Link className="btn" href="/uploads">رفع شيت جديد</Link>}
    >
      {messages.error ? <div className="error">{messages.error}</div> : null}

      <SmartTable
        title="نسخ الشيتات"
        rows={rows}
        rowHrefKey="href"
        columns={[
          { key: 'branch_name', label: 'الفرع' },
          { key: 'period', label: 'الفترة' },
          { key: 'file', label: 'الملف' },
          { key: 'version', label: 'الإصدار', numeric: true },
          { key: 'status', label: 'الحالة' },
          { key: 'historical_changes', label: 'تعديلات أيام سابقة', numeric: true },
          { key: 'uploaded_at', label: 'وقت الرفع' },
          { key: 'approved_at', label: 'وقت الاعتماد', hiddenByDefault: true },
        ]}
      />
    </AppShell>
  )
}

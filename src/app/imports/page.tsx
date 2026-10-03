import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { SmartTable } from '@/components/smart-table'
import { BatchRowActions } from '@/components/batch-row-actions'
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

  const [{ data: batches }, { data: changes }, { data: profile }] = await Promise.all([
    supabase
      .from('import_batches')
      .select('id,branch_id,original_file_name,period_start,period_end,version,status,uploaded_at,validated_at,approved_at,branches(name)')
      .order('uploaded_at', { ascending: false })
      .limit(300),
    supabase.from('import_day_changes').select('batch_id,business_date,resolution_status'),
    supabase.from('profiles').select('role').eq('user_id', auth.claims.sub).maybeSingle(),
  ])

  const changeCount = new Map<string, number>()
  for (const row of changes ?? []) changeCount.set(row.batch_id, (changeCount.get(row.batch_id) ?? 0) + 1)

  const rows = (batches ?? []).map((row) => {
    const branch = Array.isArray(row.branches) ? row.branches[0] : row.branches
    const branchName = branch?.name ?? '-'
    return {
      href: `/imports/${row.id}`,
      branch_name: branchName,
      period: `${row.period_start} — ${row.period_end}`,
      file: row.original_file_name,
      version: row.version,
      status: statusLabel[row.status] ?? row.status,
      historical_changes: changeCount.get(row.id) ?? 0,
      uploaded_at: new Date(row.uploaded_at).toLocaleString('en-GB'),
      approved_at: row.approved_at ? new Date(row.approved_at).toLocaleString('en-GB') : '',
      actions: (
        <BatchRowActions
          batchId={row.id}
          branchId={row.branch_id}
          branchName={branchName}
          periodStart={row.period_start}
          periodEnd={row.period_end}
          version={row.version}
          isAdmin={profile?.role === 'admin'}
        />
      ),
    }
  })

  return (
    <AppShell
      title="سجل الرفع والاعتماد"
      subtitle="كل نسخة محفوظة بتاريخ رفعها، مع إمكانية تعديل المحتوى، الاستبدال، أو الحذف"
      breadcrumbs={[{ label: 'لوحة الإدارة', href: '/' }, { label: 'سجل الرفع' }]}
      actions={
        <div className="flex items-center gap-2">
          <Link className="btn btn-secondary-action" href="/branch-sheets">
            عرض وتعديل الشيتات
          </Link>
          <Link className="btn btn-primary-action" href="/uploads">
            رفع شيت جديد
          </Link>
        </div>
      }
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
          { key: 'actions', label: 'الإجراءات' },
        ]}
      />
    </AppShell>
  )
}

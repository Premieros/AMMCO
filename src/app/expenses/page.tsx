import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { SmartTable } from '@/components/smart-table'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function money(value: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(value)
}

type ExpenseRow = {
  id: number | null
  branch_id: string | null
  branch_name: string | null
  entry_date: string | null
  source_code: string | null
  description: string | null
  source_category: string | null
  canonical_category: string | null
  expense_group: string | null
  amount: number | null
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; from?: string; to?: string }>
}) {
  const filters = await searchParams
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims?.sub
  if (!userId) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('user_id', userId)
    .maybeSingle()

  if (!profile) {
    return (
      <AppShell title="تحليل المصروفات" subtitle="الحساب يحتاج تهيئة من مدير النظام">
        <div className="notice">الحساب غير مربوط بمؤسسة AMMCO بعد.</div>
      </AppShell>
    )
  }

  let query = supabase
    .from('v_expense_analysis')
    .select('*')
    .order('entry_date', { ascending: false })
    .limit(5000)

  if (filters.branch) query = query.eq('branch_id', filters.branch)
  if (filters.from) query = query.gte('entry_date', filters.from)
  if (filters.to) query = query.lte('entry_date', filters.to)

  const [{ data }, { data: branches }] = await Promise.all([
    query,
    supabase.from('branches').select('id,name').eq('is_active',true).order('name'),
  ])
  const rows = (data ?? []) as ExpenseRow[]

  const total = rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
  const byGroup = new Map<string, number>()

  for (const row of rows) {
    const group = row.expense_group || 'مصروفات أخرى'
    byGroup.set(group, (byGroup.get(group) ?? 0) + Number(row.amount ?? 0))
  }

  const topGroup = [...byGroup.entries()].sort((a, b) => b[1] - a[1])[0]
  const vehicleExpenses = byGroup.get('مصروفات السيارات') ?? 0

  const tableRows = rows.map((row) => ({
    href: row.id ? `/expenses/${row.id}` : '',
    entry_date: row.entry_date ?? '',
    branch_name: row.branch_name ?? '-',
    source_code: row.source_code ?? '',
    description: row.description ?? '',
    source_category: row.source_category ?? '',
    canonical_category: row.canonical_category ?? row.source_category ?? '',
    expense_group: row.expense_group ?? '',
    amount: money(Number(row.amount ?? 0)),
    group_ratio: total ? `${((Number(row.amount ?? 0) / total) * 100).toFixed(2)}%` : '0%',
  }))

  return (
    <AppShell
      title="تحليل المصروفات"
      subtitle="تحليل تراكمي قابل للتعديل من الحركة الأصلية مع فلاتر متعددة الفروع"
      breadcrumbs={[{ label: 'لوحة الإدارة', href: '/' }, { label: 'تحليل المصروفات' }]}
    >
      <form className="card filters" method="get">
        <div className="field"><label>الفرع</label><select name="branch" defaultValue={filters.branch ?? ''}><option value="">كل الفروع</option>{(branches ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
        <div className="field"><label>من</label><input type="date" name="from" defaultValue={filters.from ?? ''} /></div>
        <div className="field"><label>إلى</label><input type="date" name="to" defaultValue={filters.to ?? ''} /></div>
        <div className="field filter-action"><label>&nbsp;</label><button className="btn" type="submit">تطبيق الفترة</button></div>
      </form>

      <div className="report-scope"><span className="scope-chip">الفرع: <strong>{(branches ?? []).find((item) => item.id === filters.branch)?.name ?? 'كل الفروع'}</strong></span><span className="scope-chip">الفترة: <strong>{filters.from || 'البداية'} → {filters.to || 'اليوم'}</strong></span></div>

      <section className="grid portal-kpis" style={{ marginTop: 16, marginBottom: 16 }}>
        <div className="card"><div className="kpi-label">إجمالي المصروفات</div><div className="kpi-value">{money(total)}</div></div>
        <div className="card"><div className="kpi-label">مصروفات السيارات</div><div className="kpi-value">{money(vehicleExpenses)}</div></div>
        <div className="card"><div className="kpi-label">أعلى مجموعة</div><div className="kpi-value small-value">{topGroup?.[0] ?? '-'}</div><div className="muted">{topGroup ? money(topGroup[1]) : '-'}</div></div>
        <div className="card"><div className="kpi-label">عدد الحركات</div><div className="kpi-value">{rows.length}</div></div>
      </section>

      <SmartTable
        title="حركات المصروفات"
        rows={tableRows}
        rowHrefKey="href"
        columns={[
          { key: 'entry_date', label: 'التاريخ' },
          { key: 'branch_name', label: 'الفرع' },
          { key: 'source_code', label: 'الكود' },
          { key: 'description', label: 'البيان' },
          { key: 'source_category', label: 'التصنيف الأصلي' },
          { key: 'canonical_category', label: 'التوجيه الحالي' },
          { key: 'expense_group', label: 'مجموعة المصروف' },
          { key: 'amount', label: 'المبلغ', numeric: true },
          { key: 'group_ratio', label: 'النسبة من إجمالي المصروفات' },
        ]}
      />
    </AppShell>
  )
}

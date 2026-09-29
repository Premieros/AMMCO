import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { SmartTable } from '@/components/smart-table'
import { createClient } from '@/lib/supabase/server'
import { createTreasuryAccount } from './actions'

export const dynamic = 'force-dynamic'

function money(value: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)
}

export default async function TreasuryPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; from?: string; to?: string }>
}) {
  const messages = await searchParams
  const from = messages.from ?? ''
  const to = messages.to ?? ''
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims?.sub
  if (!userId) redirect('/login')

  let entriesQuery = supabase
    .from('cash_entries')
    .select('id,branch_id,entry_date,direction,category,source_code,description,amount,running_balance,entry_kind,canonical_category,expense_group,treasury_account_id,branches(name),treasury_accounts(name,account_type),import_batches(uploaded_at,status)')
    .order('entry_date', { ascending: false })
    .order('id', { ascending: false })
    .limit(5000)

  if (from) entriesQuery = entriesQuery.gte('entry_date', from)
  if (to) entriesQuery = entriesQuery.lte('entry_date', to)

  const [{ data: profile }, { data: branches }, { data: accounts }, { data: entries }] = await Promise.all([
    supabase.from('profiles').select('role').eq('user_id', userId).maybeSingle(),
    supabase.from('branches').select('id,name').eq('is_active', true).order('name'),
    supabase.from('treasury_accounts').select('id,branch_id,code,name,account_type,is_default,is_active,branches(name)').eq('is_active', true).order('name'),
    entriesQuery,
  ])

  const cashEntries = entries ?? []
  const incoming = cashEntries.filter((row) => row.direction === 'in').reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
  const outgoing = cashEntries.filter((row) => row.direction === 'out').reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
  const expenses = cashEntries.filter((row) => row.entry_kind === 'expense').reduce((sum, row) => sum + Number(row.amount ?? 0), 0)

  const rows = cashEntries.map((row) => {
    const branch = Array.isArray(row.branches) ? row.branches[0] : row.branches
    const treasury = Array.isArray(row.treasury_accounts) ? row.treasury_accounts[0] : row.treasury_accounts
    const batch = Array.isArray(row.import_batches) ? row.import_batches[0] : row.import_batches

    return {
      href: `/treasury/${row.id}`,
      entry_date: row.entry_date ?? '',
      branch_name: branch?.name ?? '-',
      treasury_name: treasury?.name ?? 'الخزنة الرئيسية',
      source_code: row.source_code ?? '',
      description: row.description ?? '',
      source_category: row.category ?? '',
      canonical_category: row.canonical_category ?? '',
      expense_group: row.expense_group ?? '',
      direction: row.direction === 'in' ? 'وارد' : 'صادر',
      amount: money(Number(row.amount ?? 0)),
      running_balance: row.running_balance === null ? '' : money(Number(row.running_balance)),
      uploaded_at: batch?.uploaded_at ? new Date(batch.uploaded_at).toLocaleString('en-GB') : '',
    }
  })

  return (
    <AppShell
      title="الخزائن"
      subtitle="حركة تراكمية لكل خزائن الفروع مع البحث والفلاتر والتعديل الموثق"
      breadcrumbs={[{ label: 'لوحة الإدارة', href: '/' }, { label: 'الخزائن' }]}
    >
      {messages.error ? <div className="error">{messages.error}</div> : null}
      {messages.success ? <div className="success">{messages.success}</div> : null}

      <form className="card filters" method="get" style={{ marginBottom: 16 }}>
        <div className="field"><label>من</label><input name="from" type="date" defaultValue={from} /></div>
        <div className="field"><label>إلى</label><input name="to" type="date" defaultValue={to} /></div>
        <div className="field filter-action"><label>&nbsp;</label><button className="btn" type="submit">تطبيق الفترة</button></div>
      </form>

      <section className="grid portal-kpis" style={{ marginBottom: 16 }}>
        <div className="card"><div className="kpi-label">إجمالي الوارد</div><div className="kpi-value">{money(incoming)}</div></div>
        <div className="card"><div className="kpi-label">إجمالي الصادر</div><div className="kpi-value">{money(outgoing)}</div></div>
        <div className="card"><div className="kpi-label">المصروفات</div><div className="kpi-value">{money(expenses)}</div></div>
        <div className="card"><div className="kpi-label">عدد الخزائن</div><div className="kpi-value">{accounts?.length ?? 0}</div></div>
      </section>

      {profile?.role === 'admin' ? (
        <details className="card" style={{ marginBottom: 16 }}>
          <summary className="details-summary">إضافة خزنة / بنك</summary>
          <form action={createTreasuryAccount} className="form" style={{ marginTop: 14 }}>
            <div className="grid analytics-grid">
              <div className="field">
                <label>الفرع</label>
                <select name="branch_id" required defaultValue="">
                  <option value="" disabled>اختر الفرع</option>
                  {(branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
              </div>
              <div className="field"><label>اسم الخزنة</label><input name="name" required /></div>
              <div className="field"><label>الكود</label><input name="code" required dir="ltr" /></div>
              <div className="field">
                <label>النوع</label>
                <select name="account_type" defaultValue="cash">
                  <option value="cash">خزنة نقدية</option>
                  <option value="bank">بنك</option>
                  <option value="other">أخرى</option>
                </select>
              </div>
            </div>
            <button className="btn" type="submit">إضافة</button>
          </form>
        </details>
      ) : null}

      <SmartTable
        title="حركة الخزائن"
        rows={rows}
        rowHrefKey="href"
        columns={[
          { key: 'entry_date', label: 'التاريخ' },
          { key: 'branch_name', label: 'الفرع' },
          { key: 'treasury_name', label: 'الخزنة' },
          { key: 'source_code', label: 'الكود' },
          { key: 'description', label: 'البيان' },
          { key: 'source_category', label: 'التصنيف الأصلي' },
          { key: 'canonical_category', label: 'التوجيه' },
          { key: 'expense_group', label: 'مجموعة المصروف' },
          { key: 'direction', label: 'الحركة' },
          { key: 'amount', label: 'المبلغ', numeric: true },
          { key: 'running_balance', label: 'الرصيد', numeric: true },
          { key: 'uploaded_at', label: 'وقت رفع الشيت', hiddenByDefault: true },
        ]}
      />
    </AppShell>
  )
}

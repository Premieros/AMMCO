import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function money(value: number) {
  return new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency: 'EGP',
    maximumFractionDigits: 0,
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

  const [{ data: branches }, expensesResponse] = await Promise.all([
    supabase.from('branches').select('id, name').eq('is_active', true).order('name'),
    (async () => {
      let query = supabase
        .from('v_expense_analysis')
        .select('*')
        .order('entry_date', { ascending: false })
        .limit(2000)

      if (filters.branch) query = query.eq('branch_id', filters.branch)
      if (filters.from) query = query.gte('entry_date', filters.from)
      if (filters.to) query = query.lte('entry_date', filters.to)
      return query
    })(),
  ])

  const rows = (expensesResponse.data ?? []) as ExpenseRow[]
  const total = rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
  const byGroup = new Map<string, number>()
  const byCategory = new Map<string, number>()
  const byBranch = new Map<string, number>()

  for (const row of rows) {
    const amount = Number(row.amount ?? 0)
    const group = row.expense_group || 'مصروفات أخرى'
    const category = row.canonical_category || row.source_category || 'غير مصنف'
    const branchName = row.branch_name || 'فرع غير معروف'
    byGroup.set(group, (byGroup.get(group) ?? 0) + amount)
    byCategory.set(category, (byCategory.get(category) ?? 0) + amount)
    byBranch.set(branchName, (byBranch.get(branchName) ?? 0) + amount)
  }

  const topGroup = [...byGroup.entries()].sort((a, b) => b[1] - a[1])[0]
  const vehicleExpenses = byGroup.get('مصروفات السيارات') ?? 0

  return (
    <AppShell
      title="تحليل المصروفات"
      subtitle="المصروفات التشغيلية فقط — بدون الإيداعات والتحويلات والسلف والعهد"
    >
      <form className="card filters" method="get">
        <div className="field">
          <label>الفرع</label>
          <select name="branch" defaultValue={filters.branch ?? ''}>
            <option value="">كل الفروع</option>
            {(branches ?? []).map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>من</label>
          <input type="date" name="from" defaultValue={filters.from ?? ''} />
        </div>
        <div className="field">
          <label>إلى</label>
          <input type="date" name="to" defaultValue={filters.to ?? ''} />
        </div>
        <div className="field filter-action">
          <label>&nbsp;</label>
          <button className="btn" type="submit">تطبيق</button>
        </div>
      </form>

      <section className="grid kpis" style={{ marginTop: 18 }}>
        <div className="card"><div className="kpi-label">إجمالي المصروفات</div><div className="kpi-value">{money(total)}</div></div>
        <div className="card"><div className="kpi-label">مصروفات السيارات</div><div className="kpi-value">{money(vehicleExpenses)}</div></div>
        <div className="card"><div className="kpi-label">أعلى مجموعة</div><div className="kpi-value small-value">{topGroup?.[0] ?? '-'}</div><div className="muted">{topGroup ? money(topGroup[1]) : '-'}</div></div>
        <div className="card"><div className="kpi-label">عدد الحركات</div><div className="kpi-value">{rows.length}</div></div>
      </section>

      <section className="grid analytics-grid" style={{ marginTop: 18 }}>
        <div className="card">
          <h2>حسب مجموعة المصروف</h2>
          <div className="table-wrap enterprise-table">
            <table>
              <thead><tr><th>المجموعة</th><th>القيمة</th><th>النسبة</th></tr></thead>
              <tbody>
                {[...byGroup.entries()].sort((a,b)=>b[1]-a[1]).map(([name,value]) => (
                  <tr key={name}>
                    <td>{name}</td>
                    <td>{money(value)}</td>
                    <td>{total ? ((value / total) * 100).toFixed(1) + '%' : '0%'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h2>مقارنة الفروع</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>الفرع</th><th>المصروفات</th></tr></thead>
              <tbody>
                {[...byBranch.entries()].sort((a,b)=>b[1]-a[1]).map(([name,value]) => (
                  <tr key={name}><td>{name}</td><td>{money(value)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="card" style={{ marginTop: 18 }}>
        <h2>بنود المصروفات</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>البند</th><th>القيمة</th></tr></thead>
            <tbody>
              {[...byCategory.entries()].sort((a,b)=>b[1]-a[1]).map(([name,value]) => (
                <tr key={name}><td>{name}</td><td>{money(value)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" style={{ marginTop: 18 }}>
        <h2>الحركات الأصلية</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>التاريخ</th><th>الفرع</th><th>الكود</th><th>البيان</th><th>التوجيه</th><th>المجموعة</th><th>المبلغ</th></tr></thead>
            <tbody>
              {rows.slice(0, 250).map((row, index) => (
                <tr className="click-row" key={row.id ?? index}>
                  <td>{row.entry_date ?? '-'}</td>
                  <td>{row.branch_name ?? '-'}</td>
                  <td>{row.source_code ?? '-'}</td>
                  <td>{row.id ? <Link className="row-link" href={`/expenses/${row.id}`}>{row.description ?? 'فتح الحركة'}</Link> : (row.description ?? '-')}</td>
                  <td>{row.canonical_category ?? row.source_category ?? 'غير مصنف'}</td>
                  <td>{row.expense_group ?? '-'}</td>
                  <td>{row.id ? <Link className="row-link" href={`/expenses/${row.id}`}>{money(Number(row.amount ?? 0))}</Link> : money(Number(row.amount ?? 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  )
}

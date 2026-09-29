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

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims?.sub

  if (!userId) redirect('/login')

  const [{ data: profile }, { data: rows }] = await Promise.all([
    supabase.from('profiles').select('full_name, role').eq('user_id', userId).maybeSingle(),
    supabase
      .from('v_branch_daily_kpis')
      .select('*')
      .order('business_date', { ascending: false })
      .limit(90),
  ])

  if (!profile) {
    return (
      <AppShell title="لوحة التحكم" subtitle="الحساب يحتاج تهيئة من مدير النظام">
        <div className="notice">تم تسجيل الدخول، لكن الحساب غير مربوط بمؤسسة AMMCO بعد.</div>
      </AppShell>
    )
  }

  const data = rows ?? []
  const totals = data.reduce(
    (acc, row) => {
      acc.netSales += Number(row.net_sales ?? 0)
      acc.discounts += Number(row.discounts ?? 0)
      acc.collections += Number(row.collections ?? 0)
      acc.expenses += Number(row.expenses ?? 0)
      acc.receivables += Number(row.closing_receivables ?? 0)
      return acc
    },
    { netSales: 0, discounts: 0, collections: 0, expenses: 0, receivables: 0 },
  )

  return (
    <AppShell
      title="لوحة التحكم"
      subtitle={profile.full_name ? `مرحبًا ${profile.full_name}` : 'متابعة أداء الفروع'}
    >
      <section className="grid kpis">
        <div className="card"><div className="kpi-label">صافي المبيعات</div><div className="kpi-value">{money(totals.netSales)}</div></div>
        <div className="card"><div className="kpi-label">التحصيلات</div><div className="kpi-value">{money(totals.collections)}</div></div>
        <div className="card"><div className="kpi-label">الخصومات</div><div className="kpi-value">{money(totals.discounts)}</div></div>
        <div className="card"><div className="kpi-label">المصروفات</div><div className="kpi-value">{money(totals.expenses)}</div></div>
      </section>

      <section className="card" style={{ marginTop: 18 }}>
        <h2>آخر بيانات معتمدة</h2>
        {data.length === 0 ? (
          <p className="muted">لا توجد شيتات معتمدة حتى الآن. ارفع أول شيت من صفحة رفع الشيت.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>التاريخ</th><th>الفرع</th><th>صافي المبيعات</th><th>التحصيل</th><th>الخصم</th><th>المصروفات</th><th>المديونية</th></tr></thead>
              <tbody>
                {data.slice(0, 20).map((row, index) => (
                  <tr key={row.batch_id ?? index}>
                    <td>{row.business_date ?? '-'}</td>
                    <td>{row.branch_name ?? '-'}</td>
                    <td>{money(Number(row.net_sales ?? 0))}</td>
                    <td>{money(Number(row.collections ?? 0))}</td>
                    <td>{money(Number(row.discounts ?? 0))}</td>
                    <td>{money(Number(row.expenses ?? 0))}</td>
                    <td>{money(Number(row.closing_receivables ?? 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  )
}

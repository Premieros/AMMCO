import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { SmartTable } from '@/components/smart-table'
import { createClient } from '@/lib/supabase/server'
import { createBranch } from './actions'

export const dynamic = 'force-dynamic'

export default async function BranchesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const messages = await searchParams
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims?.sub
  if (!userId) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle()

  const { data: branches } = await supabase
    .from('branches')
    .select('id,code,name,is_active,created_at,treasury_accounts(id,name,account_type,is_default,is_active)')
    .order('created_at', { ascending: true })

  const rows = (branches ?? []).map((branch) => ({
    name: branch.name,
    code: branch.code,
    status: branch.is_active ? 'نشط' : 'متوقف',
    treasuries: Array.isArray(branch.treasury_accounts)
      ? branch.treasury_accounts.filter((item) => item.is_active).length
      : 0,
    created_at: new Date(branch.created_at).toLocaleString('en-GB'),
  }))

  return (
    <AppShell
      title="إدارة الفروع"
      subtitle="إضافة الفروع وإدارة الخزائن الأساسية ومتابعة حالة كل فرع"
      breadcrumbs={[{ label: 'لوحة الإدارة', href: '/' }, { label: 'إدارة الفروع' }]}
      actions={<a className="btn" href="#add-branch">+ إضافة فرع جديد</a>}
    >
      {messages.error ? <div className="error">{messages.error}</div> : null}
      {messages.success ? <div className="success">{messages.success}</div> : null}

      {profile?.role === 'admin' ? (
        <section id="add-branch" className="card branch-create-card" style={{ marginBottom: 16 }}>
          <div className="section-head">
            <div>
              <h2>+ إضافة فرع جديد</h2>
              <p className="muted">أدخل اسم الفرع والكود فقط. النظام ينشئ الخزنة الرئيسية تلقائيًا ويظهر الفرع فورًا في كل التقارير والفلاتر.</p>
            </div>
          </div>

          <form action={createBranch} className="form">
            <div className="grid analytics-grid">
              <div className="field">
                <label htmlFor="name">اسم الفرع</label>
                <input id="name" name="name" required placeholder="مثال: طنطا" />
              </div>
              <div className="field">
                <label htmlFor="code">كود الفرع</label>
                <input id="code" name="code" required placeholder="tanta" dir="ltr" />
              </div>
            </div>
            <div className="actions"><button className="btn" type="submit">إنشاء الفرع والخزنة الرئيسية</button><span className="scope-chip">يظهر تلقائيًا في فلاتر التقارير</span></div>
          </form>
        </section>
      ) : null}

      <SmartTable
        title="الفروع الحالية"
        rows={rows}
        columns={[
          { key: 'name', label: 'الفرع' },
          { key: 'code', label: 'الكود' },
          { key: 'status', label: 'الحالة' },
          { key: 'treasuries', label: 'عدد الخزائن', numeric: true },
          { key: 'created_at', label: 'تاريخ الإنشاء' },
        ]}
      />
    </AppShell>
  )
}

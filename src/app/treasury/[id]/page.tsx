import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { createClient } from '@/lib/supabase/server'
import { editTreasuryEntry } from './actions'

export const dynamic = 'force-dynamic'

function money(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)
}

export default async function TreasuryEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { id: rawId } = await params
  const messages = await searchParams
  const id = Number(rawId)
  if (!Number.isFinite(id)) notFound()

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims?.sub
  if (!userId) redirect('/login')

  const [{ data: profile }, { data: entry }] = await Promise.all([
    supabase.from('profiles').select('role').eq('user_id', userId).maybeSingle(),
    supabase.from('cash_entries').select('*,branches(name)').eq('id', id).maybeSingle(),
  ])

  if (!entry || !profile) notFound()
  const branch = Array.isArray(entry.branches) ? entry.branches[0] : entry.branches

  const [{ data: accounts }, { data: audit }] = await Promise.all([
    supabase.from('treasury_accounts').select('id,name,account_type').eq('branch_id', entry.branch_id).eq('is_active', true).order('name'),
    supabase.from('cash_entry_correction_log').select('*').eq('cash_entry_id', id).order('changed_at', { ascending: false }),
  ])

  const canEdit = profile.role === 'admin'

  return (
    <AppShell
      title="حركة خزنة"
      subtitle="الأصل القادم من الشيت محفوظ، والتعديلات الإدارية تسجل منفصلة"
      breadcrumbs={[
        { label: 'لوحة الإدارة', href: '/' },
        { label: 'الخزائن', href: '/treasury' },
        { label: `حركة #${id}` },
      ]}
      actions={<Link className="btn secondary" href="/treasury">رجوع للخزائن</Link>}
    >
      {messages.error ? <div className="error">{messages.error}</div> : null}
      {messages.success ? <div className="success">{messages.success}</div> : null}

      <section className="sheet-frame" style={{ marginTop: 16 }}>
        <div className="sheet-toolbar">
          <div>
            <div className="sheet-title">البيانات الأصلية من الشيت</div>
            <div className="muted">التاريخ والمبلغ والكود الأصلي لا يتم تغييرهم.</div>
          </div>
          <span className="pill">Source locked</span>
        </div>
        <div className="sheet-grid">
          <div className="sheet-cell label">الفرع</div><div className="sheet-cell value">{branch?.name ?? '-'}</div>
          <div className="sheet-cell label">التاريخ</div><div className="sheet-cell value source">{entry.entry_date ?? '-'}</div>
          <div className="sheet-cell label">الكود</div><div className="sheet-cell value source">{entry.source_code ?? entry.account_code ?? '-'}</div>
          <div className="sheet-cell label">المبلغ</div><div className="sheet-cell value source">{money(Number(entry.amount ?? 0))}</div>
          <div className="sheet-cell label">الحركة</div><div className="sheet-cell value">{entry.direction === 'in' ? 'وارد' : 'صادر'}</div>
          <div className="sheet-cell label">التصنيف الأصلي</div><div className="sheet-cell value source">{entry.category ?? '-'}</div>
          <div className="sheet-cell label">البيان الحالي</div><div className="sheet-cell value">{entry.description ?? '-'}</div>
          <div className="sheet-cell label">التوجيه الحالي</div><div className="sheet-cell value">{entry.canonical_category ?? '-'}</div>
        </div>
      </section>

      {canEdit ? (
        <section className="card edit-panel" style={{ marginTop: 16 }}>
          <div className="section-head">
            <div>
              <h2>تعديل إداري</h2>
              <p className="muted">التعديل يؤثر على العرض والتحليل فقط، بينما الأصل محفوظ في نفس الحركة وسجل الاستيراد.</p>
            </div>
          </div>
          <form action={editTreasuryEntry} className="form">
            <input type="hidden" name="id" value={id} />
            <div className="grid analytics-grid">
              <div className="field">
                <label>الخزنة / البنك</label>
                <select name="treasury_account_id" defaultValue={entry.treasury_account_id ?? ''}>
                  <option value="">بدون تحديد</option>
                  {(accounts ?? []).map((account) => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>البيان</label>
                <input name="description" defaultValue={entry.description ?? ''} />
              </div>
              <div className="field">
                <label>التوجيه</label>
                <input name="canonical_category" defaultValue={entry.canonical_category ?? entry.category ?? ''} />
              </div>
              <div className="field">
                <label>مجموعة المصروف</label>
                <select name="expense_group" defaultValue={entry.expense_group ?? ''}>
                  <option value="">بدون مجموعة</option>
                  <option>اجور وحوافز وعمولات</option>
                  <option>مصروفات السيارات</option>
                  <option>تشغيل ومرافق</option>
                  <option>اداري ومالي</option>
                  <option>انتقالات وسفر</option>
                  <option>مصروفات أخرى</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label>سبب التعديل</label>
              <input name="reason" required placeholder="مثال: تصحيح توجيه أدخله الفرع خطأ" />
            </div>
            <button className="btn" type="submit">حفظ التعديل</button>
          </form>
        </section>
      ) : null}

      <section className="card" style={{ marginTop: 16 }}>
        <div className="section-head">
          <h2>سجل التعديلات</h2>
          <span className="pill">{audit?.length ?? 0} تعديل</span>
        </div>
        <div className="audit-list">
          {(audit ?? []).length === 0 ? <div className="notice">لا توجد تعديلات على الحركة.</div> : (audit ?? []).map((item) => (
            <div className="audit-item" key={item.id}>
              <strong>{item.reason}</strong>
              <div className="muted" style={{ marginTop: 6 }}>
                البيان: {item.old_description ?? '-'} → {item.new_description ?? '-'}
              </div>
              <div className="muted">
                التوجيه: {item.old_canonical_category ?? '-'} → {item.new_canonical_category ?? '-'}
              </div>
              <div className="audit-meta">
                <span>{item.changed_at ? new Date(item.changed_at).toLocaleString('en-GB') : '-'}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  )
}

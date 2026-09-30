import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { createClient } from '@/lib/supabase/server'
import { correctExpense } from './actions'

export const dynamic = 'force-dynamic'

function money(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EGP',
    maximumFractionDigits: 2,
  }).format(value)
}

export default async function ExpenseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { id: idParam } = await params
  const { error, success } = await searchParams
  const id = Number(idParam)
  if (!Number.isFinite(id)) notFound()

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims?.sub
  if (!userId) redirect('/login')

  const [{ data: profile }, { data: entry }] = await Promise.all([
    supabase.from('profiles').select('full_name,role').eq('user_id', userId).maybeSingle(),
    supabase.from('cash_entries').select('*').eq('id', id).maybeSingle(),
  ])

  if (!profile || !entry) notFound()

  const [{ data: branch }, { data: audit }] = await Promise.all([
    supabase.from('branches').select('name').eq('id', entry.branch_id).maybeSingle(),
    supabase
      .from('cash_entry_correction_log')
      .select('*')
      .eq('cash_entry_id', id)
      .order('changed_at', { ascending: false }),
  ])

  const canEdit = profile.role === 'admin'

  return (
    <AppShell
      title="تفصيل حركة المصروف"
      subtitle="عرض مطابق لمصدر الشيت مع طبقة تصحيح منفصلة وآمنة"
      breadcrumbs={[
        { label: 'لوحة الإدارة', href: '/' },
        { label: 'تحليل المصروفات', href: '/expenses' },
        { label: `حركة #${id}` },
      ]}
      actions={<Link className="btn secondary" href="/expenses">رجوع للمصروفات</Link>}
    >
      {error ? <div className="error">{error}</div> : null}
      {success ? <div className="success">{success}</div> : null}

      <section className="sheet-frame" style={{ marginTop: 16 }}>
        <div className="sheet-toolbar">
          <div>
            <div className="sheet-title">الخزنة · السطر الأصلي</div>
            <div className="muted">الحقول الأصلية القادمة من Excel لا يتم تعديلها.</div>
          </div>
          <span className="pill">Read only source</span>
        </div>

        <div className="sheet-grid">
          <div className="sheet-cell label">الفرع</div>
          <div className="sheet-cell value">{branch?.name ?? '-'}</div>
          <div className="sheet-cell label">التاريخ</div>
          <div className="sheet-cell value">{entry.entry_date ?? '-'}</div>

          <div className="sheet-cell label">الكود</div>
          <div className="sheet-cell value source">{entry.source_code ?? entry.account_code ?? '-'}</div>
          <div className="sheet-cell label">المبلغ</div>
          <div className="sheet-cell value source">{money(Number(entry.amount ?? 0))}</div>

          <div className="sheet-cell label">البيان الأصلي</div>
          <div className="sheet-cell value source">{entry.description ?? '-'}</div>
          <div className="sheet-cell label">التصنيف الأصلي</div>
          <div className="sheet-cell value source">{entry.category ?? '-'}</div>

          <div className="sheet-cell label">التوجيه الحالي</div>
          <div className="sheet-cell value">{entry.canonical_category ?? '-'}</div>
          <div className="sheet-cell label">مجموعة المصروف</div>
          <div className="sheet-cell value">{entry.expense_group ?? '-'}</div>
        </div>
      </section>

      {canEdit ? (
        <section className="card edit-panel" style={{ marginTop: 18 }}>
          <div className="section-head">
            <div>
              <h2>تصحيح التوجيه</h2>
              <p className="muted">يتم تغيير الحقول التحليلية فقط، مع الاحتفاظ بالأصل وتسجيل كامل للتعديل.</p>
            </div>
            <span className="pill">Admin correction</span>
          </div>

          <form action={correctExpense} className="form">
            <input type="hidden" name="id" value={id} />
            <div className="grid analytics-grid">
              <div className="field">
                <label htmlFor="canonical_category">التوجيه الصحيح</label>
                <input
                  id="canonical_category"
                  name="canonical_category"
                  defaultValue={entry.canonical_category ?? entry.category ?? ''}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="expense_group">مجموعة المصروف</label>
                <select id="expense_group" name="expense_group" defaultValue={entry.expense_group ?? 'مصروفات أخرى'} required>
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
              <label htmlFor="reason">سبب التصحيح</label>
              <input id="reason" name="reason" placeholder="مثال: تم توجيهه خطأ في شيت الفرع" required />
            </div>
            <div className="actions">
              <button className="btn" type="submit">حفظ التصحيح</button>
              <Link className="btn secondary" href="/expenses">إلغاء</Link>
            </div>
          </form>
        </section>
      ) : null}

      <section className="card" style={{ marginTop: 18 }}>
        <div className="section-head">
          <div>
            <h2>سجل المراجعة</h2>
            <p className="muted">كل تغيير يحتفظ بالقيمة قبل وبعد وسبب التعديل.</p>
          </div>
          <span className="pill">{audit?.length ?? 0} تعديل</span>
        </div>

        <div className="audit-list">
          {(audit ?? []).length === 0 ? (
            <div className="notice">لا توجد تعديلات على هذه الحركة حتى الآن.</div>
          ) : (
            (audit ?? []).map((item) => (
              <div className="audit-item" key={item.id}>
                <strong>
                  {item.old_canonical_category ?? '-'} ← {item.new_canonical_category ?? '-'}
                </strong>
                <div className="muted" style={{ marginTop: 5 }}>
                  المجموعة: {item.old_expense_group ?? '-'} ← {item.new_expense_group ?? '-'}
                </div>
                <div className="audit-meta">
                  <span>السبب: {item.reason}</span>
                  <span>{item.changed_at ? new Date(item.changed_at).toLocaleString('en-US') : '-'}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </AppShell>
  )
}

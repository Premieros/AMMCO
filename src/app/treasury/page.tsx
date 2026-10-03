import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AppShell } from '@/components/app-shell'
import { UnifiedFilterBar } from '@/components/unified-filter-bar'
import { KPICard } from '@/components/kpi-card'
import { SmartDataTable } from '@/components/smart-data-table'
import { createClient } from '@/lib/supabase/server'
import { getUnifiedIntelligenceData } from '@/lib/data-source'
import { fetchAllPages, throwIfSupabaseError } from '@/lib/supabase/pagination'
import { createTreasuryAccount } from './actions'
import { Wallet, ArrowDownLeft, ArrowUpRight, History, Plus } from 'lucide-react'

export const dynamic = 'force-dynamic'

function money(v: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(v)
}

export default async function TreasuryPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; from?: string; to?: string; error?: string; success?: string }>
}) {
  const filters = await searchParams
  const supabase = await createClient()

  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims?.sub
  if (!userId) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle()

  const data = await getUnifiedIntelligenceData(supabase, {
    from: filters.from,
    to: filters.to,
    branch: filters.branch,
  })

  // Fetch all cash entries in pages so PostgREST's row cap cannot truncate the ledger.
  const cashList = await fetchAllPages(
    (rangeFrom, rangeTo) => {
      let query = supabase
        .from('cash_entries')
        .select('id, branch_id, entry_date, direction, category, source_code, description, amount, running_balance, canonical_category, expense_group, treasury_account_id, branches(name), treasury_accounts(name, account_type), import_batches(uploaded_at, status)')
        .gte('entry_date', data.from)
        .lte('entry_date', data.to)
        .order('entry_date', { ascending: false })
        .order('id', { ascending: false })

      if (filters.branch) query = query.eq('branch_id', filters.branch)
      return query.range(rangeFrom, rangeTo)
    },
    'تحميل حركات الخزينة',
  )

  const [
    { data: accounts, error: accountsError },
    { data: corrections, error: correctionsError },
  ] = await Promise.all([
    supabase.from('treasury_accounts').select('id, branch_id, name, code, account_type').eq('is_active', true),
    supabase.from('cash_entry_correction_log').select('*').order('changed_at', { ascending: false }).limit(200),
  ])

  throwIfSupabaseError(accountsError, 'تحميل حسابات الخزينة')
  throwIfSupabaseError(correctionsError, 'تحميل سجل تعديلات الخزينة')
  const correctionMap = new Map<number, NonNullable<typeof corrections>[number]>()
  for (const c of corrections ?? []) {
    if (!correctionMap.has(c.cash_entry_id)) {
      correctionMap.set(c.cash_entry_id, c)
    }
  }

  // Calculate Cash KPIs
  let totalIn = 0
  let totalOut = 0
  for (const e of cashList) {
    const amt = Number(e.amount ?? 0)
    if (e.direction === 'in') totalIn += amt
    else totalOut += amt
  }

  // Estimate opening & closing balance from latest and earliest entry
  const netCashChange = totalIn - totalOut

  const journalRows = cashList.map((row) => {
    const bName = Array.isArray(row.branches) ? row.branches[0]?.name : (row.branches as { name: string } | null)?.name ?? '-'
    const tName = Array.isArray(row.treasury_accounts) ? row.treasury_accounts[0]?.name : (row.treasury_accounts as { name: string } | null)?.name ?? 'الخزنة'
    const corr = correctionMap.get(row.id)
    const isIn = row.direction === 'in'
    const amt = Number(row.amount ?? 0)

    return {
      id: row.id,
      entryDate: row.entry_date ?? '',
      branchName: bName,
      treasuryName: tName,
      originalDesc: row.description ?? row.category ?? 'حركة نقدية',
      direction: isIn ? 'وارد' : 'صادر',
      inAmount: isIn ? money(amt) : '-',
      outAmount: !isIn ? money(amt) : '-',
      amount: amt,
      runningBalance: row.running_balance !== null ? money(Number(row.running_balance)) : '-',
      hasCorrection: Boolean(corr),
      correctionNote: corr ? `تعديل بواسطة: ${corr.changed_by} (${corr.reason})` : 'أصلي',
      lastModified: corr ? new Date(corr.changed_at).toLocaleString('en-GB') : 'أصلي',
      drillHref: `/treasury/${row.id}`,
    }
  })

  return (
    <AppShell
      title="إدارة الخزينة والسيولة النقدية"
      subtitle={`سجل حركات الخزائن والبنوك (Journal) مع الحفاظ على النص الأصلي وتوثيق كل تعديل إداري`}
      breadcrumbs={[{ label: 'لوحة الإدارة', href: '/' }, { label: 'الخزينة' }]}
    >
      {filters.error && <div className="error">{filters.error}</div>}
      {filters.success && <div className="success">{filters.success}</div>}

      <UnifiedFilterBar
        branches={data.branches}
        defaultFrom={data.from}
        defaultTo={data.to}
        defaultBranch={filters.branch}
        exportType="branches"
      />

      {/* 1. Cash Core KPIs (Requirement 11) */}
      <section className="dashboard-kpis-grid">
        <KPICard
          label="إجمالي النقدية الداخلة (الوارد)"
          currentValue={totalIn}
          format="currency"
          subtitle="توريدات مناديب ومبيعات كاش"
        />

        <KPICard
          label="إجمالي النقدية الخارجة (الصادر)"
          currentValue={totalOut}
          format="currency"
          invertSentiment={true}
          subtitle="مصروفات وتشغيل وإيداعات"
        />

        <KPICard
          label="صافي التغير في النقدية"
          currentValue={netCashChange}
          format="currency"
          subtitle="الداخل - الخارج"
        />

        <KPICard
          label="رصيد الخزائن النهائي المجمع"
          currentValue={data.currentSummary.closingCash}
          format="currency"
          subtitle="رصيد الخزائن حسب آخر شيت"
        />

        <KPICard
          label="عدد الحركات المسجلة"
          currentValue={cashList.length}
          format="number"
          subtitle="حركة نقدية وبنكية"
        />
      </section>

      {/* 2. Journal Table (Requirement 11) */}
      <section className="mt-4">
        <SmartDataTable
          title="دفتر حركة النقدية (Cash Journal)"
          subtitle="البيان الأصلي محفوظ تماماً، وأي حركة تم تصحيحها تظهر مميزة مع إمكانية فتح سجل التدقيق"
          rows={journalRows}
          rowHrefKey="drillHref"
          groupByOptions={[
            { key: 'branchName', label: 'الفرع' },
            { key: 'direction', label: 'نوع الحركة' },
          ]}
          topTotals={{
            'إجمالي الداخل': `${money(totalIn)} ج.م`,
            'إجمالي الخارج': `${money(totalOut)} ج.م`,
            'صافي الحركة': `${money(netCashChange)} ج.م`,
            'عدد الحركات': journalRows.length,
          }}
          columns={[
            { key: 'entryDate', label: 'التاريخ', sortable: true },
            { key: 'branchName', label: 'الفرع', sortable: true },
            { key: 'treasuryName', label: 'الخزنة / البنك', hideByDefault: true },
            { key: 'originalDesc', label: 'البيان الأصلي للموظف', sortable: true },
            {
              key: 'inAmount',
              label: 'داخل (وارد)',
              numeric: true,
              sortable: true,
              render: (r) => (
                <span className={r.direction === 'وارد' ? 'text-emerald-700 font-bold' : ''}>
                  {r.inAmount}
                </span>
              ),
            },
            {
              key: 'outAmount',
              label: 'خارج (صادر)',
              numeric: true,
              sortable: true,
              render: (r) => (
                <span className={r.direction === 'صادر' ? 'text-rose-700 font-bold' : ''}>
                  {r.outAmount}
                </span>
              ),
            },
            { key: 'runningBalance', label: 'الرصيد', numeric: true, sortable: true },
            {
              key: 'hasCorrection',
              label: 'حالة التعديل',
              render: (r) => (
                <span className={`pill-badge ${r.hasCorrection ? 'pill-amber' : 'pill-gray'}`}>
                  {r.hasCorrection ? 'معدل إدارياً' : 'أصلي'}
                </span>
              ),
            },
            { key: 'lastModified', label: 'آخر تحديث', hideByDefault: true },
          ]}
        />
      </section>

      {/* 3. Add Treasury Account Panel (Admin Only) */}
      {profile?.role === 'admin' && (
        <details className="mt-4 card p-4">
          <summary className="cursor-pointer font-bold text-sm text-slate-700 flex items-center gap-2">
            <Plus className="w-4 h-4 text-blue-600" />
            <span>إضافة خزنة أو حساب بنكي جديد</span>
          </summary>
          <form action={createTreasuryAccount} className="branch-form-inline mt-3">
            <div className="field-group">
              <label>الفرع</label>
              <select name="branch_id" required defaultValue="">
                <option value="" disabled>اختر الفرع</option>
                {data.branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div className="field-group">
              <label>اسم الخزنة / الحساب</label>
              <input name="name" required placeholder="مثال: حساب CIB الرئيسي" />
            </div>
            <div className="field-group">
              <label>الكود</label>
              <input name="code" required placeholder="CIB-01" dir="ltr" />
            </div>
            <div className="field-group">
              <label>النوع</label>
              <select name="account_type" defaultValue="cash">
                <option value="cash">خزنة نقدية</option>
                <option value="bank">حساب بنكي</option>
                <option value="other">أخرى</option>
              </select>
            </div>
            <button type="submit" className="btn-primary-action">
              إضافة الحساب
            </button>
          </form>
        </details>
      )}
    </AppShell>
  )
}

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AppShell } from '@/components/app-shell'
import { UnifiedFilterBar } from '@/components/unified-filter-bar'
import { KPICard } from '@/components/kpi-card'
import { SmartDataTable } from '@/components/smart-data-table'
import { createClient } from '@/lib/supabase/server'
import { getUnifiedIntelligenceData, normalizeExpenseCategory, EXPENSE_CATEGORIES } from '@/lib/data-source'
import { Receipt, Truck, Users, Wrench, Building, Megaphone, Briefcase, FileText } from 'lucide-react'

export const dynamic = 'force-dynamic'

function money(v: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(v)
}

function pct(v: number) {
  return `${(v * 100).toFixed(1)}%`
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  تشغيل: <FileText className="w-4 h-4 text-blue-600" />,
  نقل: <Truck className="w-4 h-4 text-amber-600" />,
  مرتبات: <Users className="w-4 h-4 text-emerald-600" />,
  صيانة: <Wrench className="w-4 h-4 text-orange-600" />,
  إيجارات: <Building className="w-4 h-4 text-indigo-600" />,
  تسويق: <Megaphone className="w-4 h-4 text-purple-600" />,
  إدارية: <Briefcase className="w-4 h-4 text-slate-600" />,
  أخرى: <Receipt className="w-4 h-4 text-gray-500" />,
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; from?: string; to?: string; compare?: string; category?: string }>
}) {
  const filters = await searchParams
  const supabase = await createClient()

  const { data: auth } = await supabase.auth.getClaims()
  if (!auth?.claims?.sub) redirect('/login')

  const data = await getUnifiedIntelligenceData(supabase, {
    from: filters.from,
    to: filters.to,
    branch: filters.branch,
  })

  const cur = data.currentSummary
  const prev = data.prevSummary
  const showCompare = filters.compare === '1'

  // Fetch individual expense rows from v_expense_analysis
  let query = supabase
    .from('v_expense_analysis')
    .select('*')
    .gte('entry_date', data.from)
    .lte('entry_date', data.to)
    .order('entry_date', { ascending: false })
    .limit(5000)

  if (filters.branch) {
    query = query.eq('branch_id', filters.branch)
  }

  const { data: rawExpenses } = await query

  // Categorize each row
  const categorizedExpenses = (rawExpenses ?? []).map((row) => {
    const canonical = normalizeExpenseCategory(row.canonical_category, row.expense_group)
    return {
      ...row,
      canonicalCategory: canonical,
      drillHref: `/expenses/${row.id}`,
    }
  })

  // Filter by category if requested
  const displayExpenses = filters.category
    ? categorizedExpenses.filter((e) => e.canonicalCategory === filters.category)
    : categorizedExpenses

  // Aggregate by Category
  const byCategory = new Map<string, number>()
  for (const cat of EXPENSE_CATEGORIES) {
    byCategory.set(cat, 0)
  }
  for (const e of categorizedExpenses) {
    const amt = Number(e.amount ?? 0)
    byCategory.set(e.canonicalCategory, (byCategory.get(e.canonicalCategory) ?? 0) + amt)
  }

  // Sorted categories
  const sortedCategories = [...byCategory.entries()].sort((a, b) => b[1] - a[1])

  return (
    <AppShell
      title="تحليل المصروفات والتشغيل المالي"
      subtitle={`تصنيف موحد للمصروفات مع مقارنة مباشرة بنسبة المبيعات وفحص دقيق لكل حركة`}
      breadcrumbs={[{ label: 'لوحة الإدارة', href: '/' }, { label: 'المصروفات' }]}
    >
      <UnifiedFilterBar
        branches={data.branches}
        defaultFrom={data.from}
        defaultTo={data.to}
        defaultBranch={filters.branch}
        exportType="expenses"
      />

      {/* 1. Primary Expense KPIs (with Expense / Sales % highlighted) */}
      <section className="dashboard-kpis-grid">
        <KPICard
          label="إجمالي المصروفات"
          currentValue={cur.expenses}
          previousValue={prev.expenses}
          format="currency"
          invertSentiment={true}
          showPrevious={showCompare}
          subtitle="كل بنود الصرف المعتمدة"
        />

        <KPICard
          label="نسبة المصروفات إلى المبيعات"
          currentValue={cur.expenseToSalesRate}
          previousValue={prev.expenseToSalesRate}
          format="percent"
          invertSentiment={true}
          showPrevious={showCompare}
          subtitle={`صافي المبيعات: ${money(cur.netSales)} ج.م`}
        />

        <KPICard
          label="صافي النتيجة التشغيلية"
          currentValue={cur.netResult}
          previousValue={prev.netResult}
          format="currency"
          showPrevious={showCompare}
          subtitle="صافي المبيعات - المصروفات"
        />

        <KPICard
          label="أعلى فئة مصروف"
          currentValue={sortedCategories[0]?.[1] ?? 0}
          format="currency"
          subtitle={sortedCategories[0]?.[0] ?? '-'}
        />

        <KPICard
          label="عدد حركات الصرف"
          currentValue={categorizedExpenses.length}
          format="number"
          subtitle="حركة مسجلة وموثقة"
        />
      </section>

      {/* 2. Standardized Category Breakdown Grid */}
      <section className="expense-categories-grid">
        {sortedCategories.map(([cat, amt]) => {
          const share = cur.expenses > 0 ? (amt / cur.expenses) * 100 : 0
          const isSelected = filters.category === cat

          return (
            <Link
              key={cat}
              href={`/expenses?from=${data.from}&to=${data.to}&branch=${filters.branch ?? ''}&category=${isSelected ? '' : cat}`}
              className={`category-summary-card ${isSelected ? 'selected' : ''}`}
            >
              <div className="cat-header">
                <div className="cat-icon-title">
                  {CATEGORY_ICONS[cat] ?? <Receipt className="w-4 h-4" />}
                  <strong className="cat-name">{cat}</strong>
                </div>
                <span className="cat-pct">{share.toFixed(1)}%</span>
              </div>
              <div className="cat-value">{money(amt)} ج.م</div>
              <div className="cat-progress-track">
                <div className="cat-progress-fill" style={{ width: `${Math.min(100, share)}%` }} />
              </div>
            </Link>
          )
        })}
      </section>

      {/* 3. Detailed Expense Table */}
      <section className="mt-4">
        <SmartDataTable
          title="سجل حركات المصروفات"
          subtitle="انقر على أي حركة لعرض تفاصيلها الأصلية وسجل التعديلات الإدارية"
          rows={displayExpenses}
          rowHrefKey="drillHref"
          groupByOptions={[
            { key: 'canonicalCategory', label: 'التصنيف الموحد' },
            { key: 'branch_name', label: 'الفرع' },
          ]}
          topTotals={{
            'إجمالي المصروفات': `${money(cur.expenses)} EGP`,
            'نسبة للمبيعات': pct(cur.expenseToSalesRate),
            'عدد الحركات': `${displayExpenses.length} حركة`,
          }}
          bottomTotals={{
            entry_date: `الإجمالي العام (${displayExpenses.length} حركة)`,
            branch_name: '—',
            source_code: '—',
            description: '—',
            canonicalCategory: '—',
            expense_group: '—',
            amount: `${money(cur.expenses)} EGP`,
          }}
          columns={[
            { key: 'entry_date', label: 'التاريخ', sortable: true },
            { key: 'branch_name', label: 'الفرع', sortable: true },
            { key: 'source_code', label: 'الكود الأصلي', hideByDefault: true },
            { key: 'description', label: 'البيان الأصلي', sortable: true },
            { key: 'canonicalCategory', label: 'التصنيف الموحد', sortable: true, format: 'blue-pill' },
            { key: 'expense_group', label: 'المجموعة الأصلية', hideByDefault: true },
            { key: 'amount', label: 'المبلغ (EGP)', numeric: true, sortable: true, format: 'money-egp', strong: true },
          ]}
        />
      </section>
    </AppShell>
  )
}

'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import type { BranchPerformanceRow } from '@/lib/data-source'
import { ArrowLeft } from 'lucide-react'

interface BranchBarChartProps {
  branches: BranchPerformanceRow[]
  selectedBranchId?: string
}

export function BranchBarChart({ branches, selectedBranchId }: BranchBarChartProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const maxSales = Math.max(1, ...branches.map((b) => b.netSales))

  const handleBranchClick = (branchId: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (selectedBranchId === branchId) {
      // Toggle off
      params.delete('branch')
    } else {
      params.set('branch', branchId)
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="branch-chart-card">
      <div className="branch-chart-header">
        <div>
          <h3>مقارنة أداء الفروع</h3>
          <span className="branch-chart-subtitle">
            انقر على أي فرع لتطبيق الفلتر الفوري وتفصيل بياناته
          </span>
        </div>
        {selectedBranchId && (
          <button
            type="button"
            className="clear-branch-btn"
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString())
              params.delete('branch')
              router.push(`${pathname}?${params.toString()}`)
            }}
          >
            إلغاء فلتر الفرع المختار
          </button>
        )}
      </div>

      <div className="branch-bars-list">
        {branches.length === 0 ? (
          <div className="branch-empty">لا توجد بيانات للفروع في هذه الفترة</div>
        ) : (
          branches.map((b) => {
            const widthPct = Math.max(4, Math.round((b.netSales / maxSales) * 100))
            const isSelected = selectedBranchId === b.branchId

            return (
              <div
                key={b.branchId}
                className={`branch-row-item ${isSelected ? 'selected' : ''}`}
                onClick={() => handleBranchClick(b.branchId)}
                title="اضغط للتفصيل وتطبيق الفلتر"
              >
                {/* Branch name & Company Share */}
                <div className="branch-label-col">
                  <span className="branch-name">{b.branchName}</span>
                  <span className="branch-share">
                    {b.companySharePct.toFixed(1)}% من الشركة
                  </span>
                </div>

                {/* Horizontal Progress Bar */}
                <div className="branch-bar-track">
                  <div
                    className="branch-bar-fill"
                    style={{ width: `${widthPct}%` }}
                  >
                    <span className="branch-bar-val">
                      {new Intl.NumberFormat('en-US', {
                        maximumFractionDigits: 0,
                      }).format(b.netSales)}{' '}
                      ج.م
                    </span>
                  </div>
                </div>

                {/* Metrics Breakdown (Qty, Expenses, Expense %) */}
                <div className="branch-metrics-col">
                  <div className="metric-chip">
                    <span className="chip-label">الكمية</span>
                    <span className="chip-val">
                      {new Intl.NumberFormat('en-US').format(b.salesQty)}
                    </span>
                  </div>

                  <div className="metric-chip">
                    <span className="chip-label">المصروف</span>
                    <span className="chip-val">
                      {new Intl.NumberFormat('en-US', {
                        maximumFractionDigits: 0,
                      }).format(b.expenses)}
                    </span>
                  </div>

                  <div
                    className={`metric-chip ${
                      b.expenseToSalesRate > 0.15
                        ? 'chip-warn'
                        : b.expenseToSalesRate > 0.25
                        ? 'chip-danger'
                        : ''
                    }`}
                  >
                    <span className="chip-label">% المصروف</span>
                    <span className="chip-val">
                      {(b.expenseToSalesRate * 100).toFixed(1)}%
                    </span>
                  </div>

                  <ArrowLeft className="drill-icon w-4 h-4 text-slate-400" />
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

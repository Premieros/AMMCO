'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Calendar, Filter, RefreshCw, Download, ChevronDown, Check } from 'lucide-react'

interface BranchOption {
  id: string
  name: string
  code: string
}

interface UnifiedFilterBarProps {
  branches: BranchOption[]
  defaultFrom?: string
  defaultTo?: string
  defaultBranch?: string
  exportType?: 'sales' | 'products' | 'expenses' | 'branches'
}

export function UnifiedFilterBar({
  branches,
  defaultFrom,
  defaultTo,
  defaultBranch,
  exportType = 'sales',
}: UnifiedFilterBarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const today = new Date().toISOString().slice(0, 10)
  const currentMonthStart = `${today.slice(0, 7)}-01`

  const fromVal = searchParams.get('from') || defaultFrom || currentMonthStart
  const toVal = searchParams.get('to') || defaultTo || today
  const branchVal = searchParams.get('branch') || defaultBranch || ''
  const compareVal = searchParams.get('compare') === '1'

  const [from, setFrom] = useState(fromVal)
  const [to, setTo] = useState(toVal)
  const [branch, setBranch] = useState(branchVal)
  const [compare, setCompare] = useState(compareVal)

  const applyFilters = (newParams?: { from?: string; to?: string; branch?: string; compare?: boolean }) => {
    const pFrom = newParams?.from !== undefined ? newParams.from : from
    const pTo = newParams?.to !== undefined ? newParams.to : to
    const pBranch = newParams?.branch !== undefined ? newParams.branch : branch
    const pCompare = newParams?.compare !== undefined ? newParams.compare : compare

    const params = new URLSearchParams()
    if (pFrom) params.set('from', pFrom)
    if (pTo) params.set('to', pTo)
    if (pBranch) params.set('branch', pBranch)
    if (pCompare) params.set('compare', '1')

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }

  // Quick preset handlers
  const setPreset = (preset: 'today' | 'this_week' | 'this_month' | 'last_month' | 'ytd') => {
    const now = new Date()
    let newFrom = from
    let newTo = today

    if (preset === 'today') {
      newFrom = today
      newTo = today
    } else if (preset === 'this_week') {
      const d = new Date(now)
      const day = d.getDay() // 0 = Sun
      const diff = d.getDate() - day + (day === 6 ? 0 : -1) // Adjust for Middle East week
      const weekStart = new Date(d.setDate(diff))
      newFrom = weekStart.toISOString().slice(0, 10)
      newTo = today
    } else if (preset === 'this_month') {
      newFrom = currentMonthStart
      newTo = today
    } else if (preset === 'last_month') {
      const y = now.getFullYear()
      const m = now.getMonth() // previous month index
      const startLastMonth = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10)
      const endLastMonth = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
      newFrom = startLastMonth
      newTo = endLastMonth
    } else if (preset === 'ytd') {
      newFrom = `${now.getFullYear()}-01-01`
      newTo = today
    }

    setFrom(newFrom)
    setTo(newTo)
    applyFilters({ from: newFrom, to: newTo })
  }

  const exportExcel = () => {
    const params = new URLSearchParams()
    params.set('type', exportType)
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (branch) params.set('branch', branch)
    window.location.href = `/api/export?${params.toString()}`
  }

  return (
    <div className="unified-filter-container">
      <div className="unified-filter-main">
        {/* Preset quick buttons */}
        <div className="filter-presets">
          <button
            type="button"
            className={`preset-btn ${from === today && to === today ? 'active' : ''}`}
            onClick={() => setPreset('today')}
          >
            اليوم
          </button>
          <button
            type="button"
            className={`preset-btn ${from === currentMonthStart && to === today ? 'active' : ''}`}
            onClick={() => setPreset('this_month')}
          >
            هذا الشهر
          </button>
          <button
            type="button"
            className="preset-btn"
            onClick={() => setPreset('last_month')}
          >
            الشهر السابق
          </button>
          <button
            type="button"
            className="preset-btn"
            onClick={() => setPreset('ytd')}
          >
            YTD السنوي
          </button>
        </div>

        {/* Date pickers */}
        <div className="filter-date-group">
          <div className="filter-field">
            <span className="filter-label">من</span>
            <input
              type="date"
              className="filter-input-date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value)
              }}
              onBlur={() => applyFilters({ from })}
            />
          </div>
          <div className="filter-field">
            <span className="filter-label">إلى</span>
            <input
              type="date"
              className="filter-input-date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value)
              }}
              onBlur={() => applyFilters({ to })}
            />
          </div>
        </div>

        {/* Branch select */}
        <div className="filter-field branch-field">
          <span className="filter-label">الفرع</span>
          <select
            className="filter-select"
            value={branch}
            onChange={(e) => {
              const val = e.target.value
              setBranch(val)
              applyFilters({ branch: val })
            }}
          >
            <option value="">جميع الفروع ({branches.length})</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        {/* Compare toggle switch */}
        <label className="filter-checkbox-label">
          <input
            type="checkbox"
            checked={compare}
            onChange={(e) => {
              const val = e.target.checked
              setCompare(val)
              applyFilters({ compare: val })
            }}
          />
          <span>مقارنة بالفترة السابقة</span>
        </label>

        {/* Action buttons */}
        <div className="filter-actions">
          <button
            type="button"
            className="btn-filter-refresh"
            onClick={() => applyFilters()}
            disabled={isPending}
            title="تحديث البيانات"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isPending ? 'animate-spin' : ''}`} />
            <span>تحديث</span>
          </button>

          <button
            type="button"
            className="btn-filter-export"
            onClick={exportExcel}
            title="تصدير كامل البيانات إلى Excel"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel تصدير</span>
          </button>
        </div>
      </div>
    </div>
  )
}

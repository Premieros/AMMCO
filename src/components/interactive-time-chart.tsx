'use client'

import { useState, useMemo } from 'react'
import type { DailyPoint } from '@/lib/data-source'

interface InteractiveTimeChartProps {
  data: DailyPoint[]
}

type AggregationMode = 'day' | 'week' | 'month'

export function InteractiveTimeChart({ data }: InteractiveTimeChartProps) {
  const [mode, setMode] = useState<AggregationMode>('day')
  const [showSales, setShowSales] = useState(true)
  const [showExpenses, setShowExpenses] = useState(true)
  const [showQty, setShowQty] = useState(false)
  const [showAvgPrice, setShowAvgPrice] = useState(false)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  // Aggregate points based on chosen mode
  const aggregatedData = useMemo(() => {
    if (data.length === 0) return []

    if (mode === 'day') {
      return data.map((d) => ({
        label: d.date.slice(5), // MM-DD
        fullDate: d.date,
        netSales: d.netSales,
        expenses: d.expenses,
        salesQty: d.salesQty,
        avgPrice: d.salesQty > 0 ? d.netSales / d.salesQty : d.avgPrice,
      }))
    }

    if (mode === 'month') {
      const months = new Map<string, { label: string; fullDate: string; netSales: number; expenses: number; salesQty: number; avgPrice: number }>()
      for (const d of data) {
        const m = d.date.slice(0, 7) // YYYY-MM
        const existing = months.get(m) ?? {
          label: m,
          fullDate: m,
          netSales: 0,
          expenses: 0,
          salesQty: 0,
          avgPrice: 0,
        }
        existing.netSales += d.netSales
        existing.expenses += d.expenses
        existing.salesQty += d.salesQty
        months.set(m, existing)
      }
      return [...months.values()].map((item) => ({
        ...item,
        avgPrice: item.salesQty > 0 ? item.netSales / item.salesQty : 0,
      }))
    }

    // mode === 'week'
    const weeks: Array<{ label: string; fullDate: string; netSales: number; expenses: number; salesQty: number; avgPrice: number }> = []
    let currentWeek: (typeof weeks)[0] | null = null
    let count = 0

    for (let i = 0; i < data.length; i++) {
      const d = data[i]
      if (count % 7 === 0) {
        if (currentWeek) {
          currentWeek.avgPrice = currentWeek.salesQty > 0 ? currentWeek.netSales / currentWeek.salesQty : 0
          weeks.push(currentWeek)
        }
        currentWeek = {
          label: `أسبوع ${weeks.length + 1} (${d.date.slice(5)})`,
          fullDate: d.date,
          netSales: 0,
          expenses: 0,
          salesQty: 0,
          avgPrice: 0,
        }
      }
      if (currentWeek) {
        currentWeek.netSales += d.netSales
        currentWeek.expenses += d.expenses
        currentWeek.salesQty += d.salesQty
      }
      count++
    }
    if (currentWeek) {
      currentWeek.avgPrice = currentWeek.salesQty > 0 ? currentWeek.netSales / currentWeek.salesQty : 0
      weeks.push(currentWeek)
    }
    return weeks
  }, [data, mode])

  // Chart dimensions & scaling
  const maxFinancial = useMemo(() => {
    let max = 1000
    for (const d of aggregatedData) {
      if (showSales && d.netSales > max) max = d.netSales
      if (showExpenses && d.expenses > max) max = d.expenses
    }
    return Math.ceil(max * 1.1)
  }, [aggregatedData, showSales, showExpenses])

  const maxQty = useMemo(() => {
    let max = 10
    for (const d of aggregatedData) {
      if (showQty && d.salesQty > max) max = d.salesQty
    }
    return Math.ceil(max * 1.1)
  }, [aggregatedData, showQty])

  const maxPrice = useMemo(() => {
    let max = 10
    for (const d of aggregatedData) {
      if (showAvgPrice && d.avgPrice > max) max = d.avgPrice
    }
    return Math.ceil(max * 1.1)
  }, [aggregatedData, showAvgPrice])

  const chartHeight = 240
  const chartWidth = 900
  const paddingX = 40
  const paddingY = 25
  const usableWidth = chartWidth - paddingX * 2
  const usableHeight = chartHeight - paddingY * 2

  const getX = (index: number) => {
    if (aggregatedData.length <= 1) return paddingX + usableWidth / 2
    return paddingX + (index / (aggregatedData.length - 1)) * usableWidth
  }

  const getYFinancial = (val: number) => {
    return chartHeight - paddingY - (val / (maxFinancial || 1)) * usableHeight
  }

  const getYSecondary = (val: number, max: number) => {
    return chartHeight - paddingY - (val / (max || 1)) * usableHeight
  }

  // Paths
  const salesPath = useMemo(() => {
    if (!showSales || aggregatedData.length === 0) return ''
    return aggregatedData
      .map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getYFinancial(d.netSales)}`)
      .join(' ')
  }, [aggregatedData, showSales, maxFinancial])

  const expensesPath = useMemo(() => {
    if (!showExpenses || aggregatedData.length === 0) return ''
    return aggregatedData
      .map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getYFinancial(d.expenses)}`)
      .join(' ')
  }, [aggregatedData, showExpenses, maxFinancial])

  const qtyPath = useMemo(() => {
    if (!showQty || aggregatedData.length === 0) return ''
    return aggregatedData
      .map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getYSecondary(d.salesQty, maxQty)}`)
      .join(' ')
  }, [aggregatedData, showQty, maxQty])

  const pricePath = useMemo(() => {
    if (!showAvgPrice || aggregatedData.length === 0) return ''
    return aggregatedData
      .map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getYSecondary(d.avgPrice, maxPrice)}`)
      .join(' ')
  }, [aggregatedData, showAvgPrice, maxPrice])

  return (
    <div className="chart-card">
      <div className="chart-header">
        <div className="chart-title-group">
          <h3>المبيعات والمصروفات عبر الزمن</h3>
          <span className="chart-subtitle">متابعة دقيقة للأداء التشغيلي المالي والكمي</span>
        </div>

        {/* Aggregation Mode Selector */}
        <div className="chart-controls">
          <div className="chart-mode-pill">
            <button
              type="button"
              className={mode === 'day' ? 'active' : ''}
              onClick={() => setMode('day')}
            >
              يومي
            </button>
            <button
              type="button"
              className={mode === 'week' ? 'active' : ''}
              onClick={() => setMode('week')}
            >
              أسبوعي
            </button>
            <button
              type="button"
              className={mode === 'month' ? 'active' : ''}
              onClick={() => setMode('month')}
            >
              شهري
            </button>
          </div>
        </div>
      </div>

      {/* Series Toggles */}
      <div className="chart-series-toggles">
        <label className="series-checkbox series-blue">
          <input
            type="checkbox"
            checked={showSales}
            onChange={(e) => setShowSales(e.target.checked)}
          />
          <span className="series-indicator color-blue" />
          <span>المبيعات</span>
        </label>

        <label className="series-checkbox series-red">
          <input
            type="checkbox"
            checked={showExpenses}
            onChange={(e) => setShowExpenses(e.target.checked)}
          />
          <span className="series-indicator color-red" />
          <span>المصروفات</span>
        </label>

        <label className="series-checkbox series-emerald">
          <input
            type="checkbox"
            checked={showQty}
            onChange={(e) => setShowQty(e.target.checked)}
          />
          <span className="series-indicator color-emerald" />
          <span>كمية المبيعات</span>
        </label>

        <label className="series-checkbox series-amber">
          <input
            type="checkbox"
            checked={showAvgPrice}
            onChange={(e) => setShowAvgPrice(e.target.checked)}
          />
          <span className="series-indicator color-amber" />
          <span>متوسط السعر</span>
        </label>
      </div>

      {/* Chart Canvas */}
      <div className="chart-svg-wrapper">
        {aggregatedData.length === 0 ? (
          <div className="chart-empty-state">لا توجد حركات معتمدة للفترة المحددة</div>
        ) : (
          <svg
            className="chart-svg"
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            preserveAspectRatio="none"
          >
            {/* Horizontal Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
              const y = chartHeight - paddingY - pct * usableHeight
              const val = Math.round(pct * maxFinancial)
              return (
                <g key={pct}>
                  <line
                    x1={paddingX}
                    y1={y}
                    x2={chartWidth - paddingX}
                    y2={y}
                    stroke="#E2E8F0"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={paddingX - 6}
                    y={y + 3}
                    textAnchor="end"
                    fontSize="9"
                    fill="#94A3B8"
                  >
                    {val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}
                  </text>
                </g>
              )
            })}

            {/* Sales Line & Points */}
            {showSales && salesPath && (
              <>
                <path
                  d={salesPath}
                  fill="none"
                  stroke="#2563EB"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {aggregatedData.map((d, i) => (
                  <circle
                    key={`sales-${i}`}
                    cx={getX(i)}
                    cy={getYFinancial(d.netSales)}
                    r={hoveredIndex === i ? 5 : 2.5}
                    fill="#2563EB"
                    stroke="#FFFFFF"
                    strokeWidth="1.5"
                  />
                ))}
              </>
            )}

            {/* Expenses Line & Points */}
            {showExpenses && expensesPath && (
              <>
                <path
                  d={expensesPath}
                  fill="none"
                  stroke="#EF4444"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {aggregatedData.map((d, i) => (
                  <circle
                    key={`exp-${i}`}
                    cx={getX(i)}
                    cy={getYFinancial(d.expenses)}
                    r={hoveredIndex === i ? 5 : 2.5}
                    fill="#EF4444"
                    stroke="#FFFFFF"
                    strokeWidth="1.5"
                  />
                ))}
              </>
            )}

            {/* Qty Line (Secondary) */}
            {showQty && qtyPath && (
              <path
                d={qtyPath}
                fill="none"
                stroke="#10B981"
                strokeWidth="2"
                strokeDasharray="3 3"
              />
            )}

            {/* Price Line (Secondary) */}
            {showAvgPrice && pricePath && (
              <path
                d={pricePath}
                fill="none"
                stroke="#F59E0B"
                strokeWidth="2"
                strokeDasharray="2 2"
              />
            )}

            {/* Vertical crosshair on hover */}
            {hoveredIndex !== null && (
              <line
                x1={getX(hoveredIndex)}
                y1={paddingY}
                x2={getX(hoveredIndex)}
                y2={chartHeight - paddingY}
                stroke="#64748B"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
            )}

            {/* Hover Interaction Areas */}
            {aggregatedData.map((d, i) => {
              const x = getX(i)
              return (
                <rect
                  key={`hover-${i}`}
                  x={x - usableWidth / (aggregatedData.length * 2)}
                  y={0}
                  width={usableWidth / aggregatedData.length}
                  height={chartHeight}
                  fill="transparent"
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  style={{ cursor: 'pointer' }}
                />
              )
            })}

            {/* X-axis labels */}
            {aggregatedData.map((d, i) => {
              // Only render every nth label if crowded
              const step = Math.ceil(aggregatedData.length / 10)
              if (i % step !== 0 && i !== aggregatedData.length - 1) return null
              return (
                <text
                  key={`label-${i}`}
                  x={getX(i)}
                  y={chartHeight - 6}
                  textAnchor="middle"
                  fontSize="9"
                  fill="#64748B"
                  fontWeight="600"
                >
                  {d.label}
                </text>
              )
            })}
          </svg>
        )}
      </div>

      {/* Tooltip detail bar */}
      {hoveredIndex !== null && aggregatedData[hoveredIndex] && (
        <div className="chart-tooltip-bar">
          <span className="tooltip-date">
            التاريخ: <strong>{aggregatedData[hoveredIndex].fullDate}</strong>
          </span>
          {showSales && (
            <span className="tooltip-item color-blue">
              المبيعات:{' '}
              <strong>
                {aggregatedData[hoveredIndex].netSales.toLocaleString('en-US', {
                  maximumFractionDigits: 0,
                })}{' '}
                ج.م
              </strong>
            </span>
          )}
          {showExpenses && (
            <span className="tooltip-item color-red">
              المصروفات:{' '}
              <strong>
                {aggregatedData[hoveredIndex].expenses.toLocaleString('en-US', {
                  maximumFractionDigits: 0,
                })}{' '}
                ج.م
              </strong>
            </span>
          )}
          {showQty && (
            <span className="tooltip-item color-emerald">
              الكمية:{' '}
              <strong>
                {aggregatedData[hoveredIndex].salesQty.toLocaleString('en-US')}
              </strong>
            </span>
          )}
          {showAvgPrice && (
            <span className="tooltip-item color-amber">
              متوسط السعر:{' '}
              <strong>
                {aggregatedData[hoveredIndex].avgPrice.toFixed(1)} ج.م
              </strong>
            </span>
          )}
        </div>
      )}
    </div>
  )
}

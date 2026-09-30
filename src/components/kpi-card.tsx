import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'

interface KPICardProps {
  label: string
  currentValue: number
  previousValue?: number
  format?: 'currency' | 'number' | 'percent'
  invertSentiment?: boolean // If true, increase is BAD (e.g. expenses, expense/sales ratio)
  showPrevious?: boolean
  subtitle?: string
}

export function KPICard({
  label,
  currentValue,
  previousValue,
  format = 'currency',
  invertSentiment = false,
  showPrevious = true,
  subtitle,
}: KPICardProps) {
  const formatValue = (v: number) => {
    if (format === 'percent') {
      return `${(v * 100).toFixed(1)}%`
    }
    if (format === 'number') {
      return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(v)
    }
    return new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 0,
    }).format(v) + ' ج.م'
  }

  let deltaPct: number | null = null
  let isPositive = false
  let isNeutral = true

  if (previousValue !== undefined && previousValue !== null && previousValue !== 0) {
    deltaPct = ((currentValue - previousValue) / Math.abs(previousValue)) * 100
    if (Math.abs(deltaPct) < 0.1) {
      isNeutral = true
    } else {
      isNeutral = false
      const increased = deltaPct > 0
      // Invert sentiment if requested
      isPositive = invertSentiment ? !increased : increased
    }
  }

  return (
    <div className="executive-kpi-card">
      <div className="kpi-header">
        <span className="kpi-title">{label}</span>
        {deltaPct !== null && !isNeutral && (
          <span
            className={`kpi-badge ${
              isPositive ? 'badge-success' : 'badge-danger'
            }`}
          >
            {deltaPct > 0 ? (
              <ArrowUpRight className="w-3.5 h-3.5 inline mr-0.5" />
            ) : (
              <ArrowDownRight className="w-3.5 h-3.5 inline mr-0.5" />
            )}
            {Math.abs(deltaPct).toFixed(1)}%
          </span>
        )}
        {deltaPct !== null && isNeutral && (
          <span className="kpi-badge badge-neutral">
            <Minus className="w-3 h-3 inline mr-0.5" />
            0%
          </span>
        )}
      </div>

      <div className="kpi-current-val">{formatValue(currentValue)}</div>

      <div className="kpi-footer">
        {showPrevious && previousValue !== undefined && previousValue !== null ? (
          <div className="kpi-prev-row">
            <span className="prev-label">السابق:</span>
            <span className="prev-val">{formatValue(previousValue)}</span>
          </div>
        ) : subtitle ? (
          <span className="kpi-subtitle">{subtitle}</span>
        ) : null}
      </div>
    </div>
  )
}

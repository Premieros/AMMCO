import Link from 'next/link'
import type { AnomalyItem } from '@/lib/anomalies'
import { AlertTriangle, AlertCircle, Info, ChevronLeft, ShieldCheck } from 'lucide-react'

interface AnomaliesListProps {
  anomalies: AnomalyItem[]
}

export function AnomaliesList({ anomalies }: AnomaliesListProps) {
  if (anomalies.length === 0) {
    return (
      <div className="anomalies-card empty-state">
        <div className="anomalies-header">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <h3>كشف الانحرافات والذكاء التشغيلي</h3>
          </div>
          <span className="badge-clean">كل المؤشرات متوازنة</span>
        </div>
        <p className="clean-copy">
          لم يتم رصد أي انحرافات سعرية أو تعديلات تاريخية أو فروق غير مبررة في مديونية الفروع خلال الفترة الحالية.
        </p>
      </div>
    )
  }

  return (
    <div className="anomalies-card">
      <div className="anomalies-header">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-600" />
          <h3>كشف الانحرافات والملاحظات الإدارية ({anomalies.length})</h3>
        </div>
        <span className="badge-alert">تنبيهات فورية للمتابعة</span>
      </div>

      <div className="anomalies-grid">
        {anomalies.map((item) => {
          const isCritical = item.severity === 'critical'
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`anomaly-item-link ${isCritical ? 'border-red' : 'border-amber'}`}
            >
              <div className="anomaly-icon-wrap">
                {isCritical ? (
                  <AlertCircle className="w-4 h-4 text-rose-600" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                )}
              </div>

              <div className="anomaly-content">
                <div className="anomaly-top">
                  <strong className="anomaly-title">{item.title}</strong>
                  {item.branchName && (
                    <span className="anomaly-branch-tag">{item.branchName}</span>
                  )}
                </div>
                <p className="anomaly-desc">{item.description}</p>
                {(item.metricValue || item.expectedValue) && (
                  <div className="anomaly-stats">
                    {item.metricValue && (
                      <span>
                        المرصود: <b>{item.metricValue}</b>
                      </span>
                    )}
                    {item.expectedValue && (
                      <span>
                        المتوقع/المتوسط: <b>{item.expectedValue}</b>
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="anomaly-arrow">
                <ChevronLeft className="w-4 h-4 text-slate-400" />
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

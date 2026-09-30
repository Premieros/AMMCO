import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AppShell } from '@/components/app-shell'
import { UnifiedFilterBar } from '@/components/unified-filter-bar'
import { createClient } from '@/lib/supabase/server'
import { getUnifiedIntelligenceData } from '@/lib/data-source'
import { detectAnomalies, AnomalyItem } from '@/lib/anomalies'
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  FileCheck,
  Clock,
  ArrowRight,
  CheckCircle,
  ExternalLink,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function ManagementCenterPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; from?: string; to?: string }>
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

  // Detect actionable items
  const anomalies = await detectAnomalies(
    supabase,
    data.from,
    data.to,
    filters.branch
  )

  // Fetch pending batches (status == 'validated' or 'rejected')
  const { data: pendingBatches } = await supabase
    .from('import_batches')
    .select('id, branch_id, original_file_name, period_start, period_end, version, status, uploaded_at, branches(name)')
    .in('status', ['validated', 'rejected', 'failed'])
    .order('uploaded_at', { ascending: false })

  // Calculate Data Quality Score (0 to 100%)
  const totalChecks = 100
  let deductions = 0
  for (const a of anomalies) {
    if (a.severity === 'critical') deductions += 12
    else if (a.severity === 'warning') deductions += 4
    else deductions += 1
  }
  deductions += (pendingBatches?.length ?? 0) * 5
  const qualityScore = Math.max(10, Math.min(100, totalChecks - deductions))

  return (
    <AppShell
      title="مركز الإدارة وجودة البيانات (Management Action Center)"
      subtitle="متابعة فورية للبنود التشغيلية التي تحتاج تدخلاً إدارياً مع قياس سلامة ونزاهة البيانات"
      breadcrumbs={[{ label: 'لوحة الإدارة', href: '/' }, { label: 'مركز الإدارة' }]}
    >
      <UnifiedFilterBar
        branches={data.branches}
        defaultFrom={data.from}
        defaultTo={data.to}
        defaultBranch={filters.branch}
      />

      {/* 1. Data Integrity & Health Score Banner (Requirement 14) */}
      <section className="data-quality-hero-card">
        <div className="hero-score-left">
          <div className="score-ring">
            <span className="score-number">{qualityScore}%</span>
            <span className="score-label">نسبة سلامة البيانات</span>
          </div>
          <div className="score-details">
            <h3>مؤشر جودة ونزاهة البيانات التشغيلية</h3>
            <p className="text-xs text-slate-500 mt-1">
              يتم قياس المؤشر آلياً بناءً على: اكتمال رفع الفروع، تطابق معادلات الأرصدة، ثبات الأسعار، وخلو النسخ من التعديلات غير المعتمدة.
            </p>
          </div>
        </div>

        <div className="hero-metrics-right">
          <div className="quality-submetric">
            <span className="submetric-label">التغطية التشغيلية</span>
            <strong className="submetric-val">
              {data.currentSummary.reportingBranchesCount} / {data.branches.length} فرع
            </strong>
          </div>
          <div className="quality-submetric">
            <span className="submetric-label">تنبيهات نشطة</span>
            <strong className={`submetric-val ${anomalies.length > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {anomalies.length} تنبيه
            </strong>
          </div>
          <div className="quality-submetric">
            <span className="submetric-label">ملفات تنتظر الاعتماد</span>
            <strong className="submetric-val text-blue-600">
              {pendingBatches?.length ?? 0} ملف
            </strong>
          </div>
        </div>
      </section>

      {/* 2. Action Center Queue (Requirement 12: Action Center وليس مجرد تقرير) */}
      <section className="action-queue-section mt-4">
        <div className="section-title-wrap">
          <ShieldAlert className="w-5 h-5 text-amber-600" />
          <div>
            <h3>قائمة التدخل الإداري العاجل ({anomalies.length})</h3>
            <span className="text-xs text-slate-500">
              بنود تتطلب التحقق أو التواصل مع مسؤول الفرع أو مراجعة السجلات
            </span>
          </div>
        </div>

        {anomalies.length === 0 ? (
          <div className="empty-action-box">
            <ShieldCheck className="w-8 h-8 text-emerald-600 mb-2" />
            <strong>لا توجد بنود معلقة تحتاج تدخلاً إدارياً حالياً</strong>
            <p className="text-xs text-slate-500">
              جميع أرصدة الفروع مطابقة، والتسعير موحد، وكافة الفروع رفعت بياناتها بنجاح.
            </p>
          </div>
        ) : (
          <div className="action-cards-grid">
            {anomalies.map((item) => (
              <div key={item.id} className="action-item-card">
                <div className="action-card-top">
                  <span className={`severity-tag ${item.severity}`}>
                    {item.severity === 'critical' ? 'حرج / تدقيق فوري' : 'تنبيه تشغيلي'}
                  </span>
                  {item.branchName && (
                    <span className="branch-tag">{item.branchName}</span>
                  )}
                </div>

                <h4 className="action-item-title">{item.title}</h4>
                <p className="action-item-desc">{item.description}</p>

                <div className="action-card-footer">
                  <Link href={item.href} className="btn-take-action">
                    <span>فتح وفحص الحركة</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 3. Pending & Upload Validation Queue */}
      <section className="pending-imports-section mt-6">
        <div className="section-title-wrap">
          <FileCheck className="w-5 h-5 text-blue-600" />
          <div>
            <h3>ملفات الشيت المعلقة والمرفوضة ({pendingBatches?.length ?? 0})</h3>
            <span className="text-xs text-slate-500">
              ملفات تم رفعها وتحتاج مراجعة الملاحظات واعتماد مدير النظام
            </span>
          </div>
        </div>

        <div className="excel-scroll-frame mt-2">
          <table className="excel-table">
            <thead>
              <tr>
                <th className="sticky-first-col">الفرع</th>
                <th>اسم الملف</th>
                <th>الفترة</th>
                <th>الإصدار</th>
                <th>الحالة</th>
                <th>وقت الرفع</th>
                <th>الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {(pendingBatches ?? []).length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty-cell">
                    لا توجد ملفات معلقة — جميع النسخ معتمدة ورسمية
                  </td>
                </tr>
              ) : (
                (pendingBatches ?? []).map((batch) => {
                  const bName = Array.isArray(batch.branches)
                    ? batch.branches[0]?.name
                    : (batch.branches as { name: string } | null)?.name ?? '-'
                  return (
                    <tr key={batch.id}>
                      <td className="sticky-first-col font-bold">{bName}</td>
                      <td dir="ltr" className="text-right">{batch.original_file_name}</td>
                      <td>{batch.period_start} — {batch.period_end}</td>
                      <td>إصدار {batch.version}</td>
                      <td>
                        <span className={`pill-badge ${batch.status === 'validated' ? 'pill-blue' : 'pill-red'}`}>
                          {batch.status === 'validated' ? 'جاهز للاعتماد' : batch.status}
                        </span>
                      </td>
                      <td className="text-xs text-slate-500">
                        {new Date(batch.uploaded_at).toLocaleString('en-GB')}
                      </td>
                      <td>
                        <Link href={`/imports/${batch.id}`} className="btn-table-action">
                          <span>مراجعة</span>
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  )
}

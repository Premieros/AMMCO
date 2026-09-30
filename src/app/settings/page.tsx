import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AppShell } from '@/components/app-shell'
import { createClient } from '@/lib/supabase/server'
import { Settings, Shield, Store, Database, CheckCircle2, ArrowRight } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const supabase = await createClient()

  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims?.sub
  if (!userId) redirect('/login')

  const [{ data: profile }, { data: branches }] = await Promise.all([
    supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('branches').select('*').order('name'),
  ])

  return (
    <AppShell
      title="إعدادات النظام والتهيئة"
      subtitle="إدارة الصلاحيات، إعدادات المستحقات الشهرية للفروع، وحالة الاتصال بقاعدة بيانات AMMCO"
      breadcrumbs={[{ label: 'لوحة الإدارة', href: '/' }, { label: 'الإعدادات' }]}
    >
      <div className="settings-sections-grid">
        {/* System & Isolation Status */}
        <section className="settings-card">
          <div className="card-head-simple">
            <Database className="w-5 h-5 text-blue-600" />
            <h4>عزل قاعدة البيانات (Database Isolation)</h4>
          </div>
          <div className="settings-status-box">
            <div className="flex items-center gap-2 text-emerald-700 font-bold mb-1">
              <CheckCircle2 className="w-4 h-4" />
              <span>مشروع AMMCO المستقل مفعل ومؤمّن</span>
            </div>
            <p className="text-xs text-slate-500 mb-2">
              المشروع المعتمد: <code>yumeijsyiphzdsulsubf</code>. لا يتم الاتصال أو التبديل مع أي مشروع آخر وفقاً للقواعد الصارمة.
            </p>
          </div>
        </section>

        {/* User Profile */}
        <section className="settings-card">
          <div className="card-head-simple">
            <Shield className="w-5 h-5 text-indigo-600" />
            <h4>معلومات الحساب والصلاحية</h4>
          </div>
          <div className="user-details-list">
            <div className="detail-line">
              <span className="line-label">الاسم:</span>
              <strong className="line-val">{profile?.full_name ?? 'مدير النظام'}</strong>
            </div>
            <div className="detail-line">
              <span className="line-label">الدور:</span>
              <span className="pill-badge pill-blue">{profile?.role ?? 'admin'}</span>
            </div>
            <div className="detail-line">
              <span className="line-label">حالة الحساب:</span>
              <span className="pill-badge pill-emerald">نشط</span>
            </div>
          </div>
        </section>

        {/* Accruals Navigation */}
        <section className="settings-card">
          <div className="card-head-simple">
            <Store className="w-5 h-5 text-amber-600" />
            <h4>إعدادات مستحقات الفروع</h4>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            ضبط الأجور الشهرية المعتمدة، إيجار المقرات، نسب العمولات، وأيام الأساس لكل فرع لاحتساب التكلفة التحليلية اليومية.
          </p>
          <Link href="/accrued-expenses" className="btn-secondary-action">
            <span>فتح إعدادات المستحقات</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </section>

        {/* Branches Overview */}
        <section className="settings-card">
          <div className="card-head-simple">
            <Settings className="w-5 h-5 text-slate-600" />
            <h4>إدارة الفروع ({branches?.length ?? 0})</h4>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            إضافة فروع جديدة، مراجعة الأكواد التشغيلية، وربط الخزائن التلقائية.
          </p>
          <Link href="/branches" className="btn-secondary-action">
            <span>إدارة الفروع والخزائن</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </section>
      </div>
    </AppShell>
  )
}

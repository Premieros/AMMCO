import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { throwIfSupabaseError } from '@/lib/supabase/pagination'

export const dynamic = 'force-dynamic'

function cardStyle() {
  return {
    border: '1px solid #e2e8f0',
    borderRadius: 14,
    background: '#ffffff',
    padding: 18,
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
  } as const
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims?.sub
  if (!userId) redirect('/login')

  const [
    profileResult,
    branchesResult,
    latestBatchResult,
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name, role, is_active')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('branches')
      .select('id, name, code, is_active')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('import_batches')
      .select('id, original_file_name, status, period_start, period_end, uploaded_at, branch_id')
      .eq('status', 'approved')
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  throwIfSupabaseError(profileResult.error, 'تحميل بيانات المستخدم')
  throwIfSupabaseError(branchesResult.error, 'تحميل الفروع')
  throwIfSupabaseError(latestBatchResult.error, 'تحميل آخر دفعة معتمدة')

  const profile = profileResult.data
  if (!profile?.is_active) {
    return (
      <main dir="rtl" style={{ maxWidth: 760, margin: '60px auto', padding: 24 }}>
        <h1>AMMCO</h1>
        <p>الحساب غير مفعّل. يرجى مراجعة مسؤول النظام.</p>
      </main>
    )
  }

  const branches = branchesResult.data ?? []
  const latestBatch = latestBatchResult.data
  const displayName = profile.full_name || 'الإدارة المركزية'

  const links = [
    ['شيتات الفروع', '/branch-sheets'],
    ['المبيعات', '/sales'],
    ['الأصناف', '/products'],
    ['الخزينة', '/treasury'],
    ['المصروفات', '/expenses'],
    ['الفروع', '/branches'],
    ['التحليلات', '/analytics'],
    ['التقارير', '/reports'],
    ['سجل الرفع والاعتماد', '/imports'],
    ['مركز الإدارة', '/management-center'],
    ['الإعدادات', '/settings'],
  ] as const

  return (
    <main
      dir="rtl"
      style={{
        minHeight: '100vh',
        background: '#f8fafc',
        color: '#0f172a',
        padding: '28px 18px 60px',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <header
          style={{
            ...cardStyle(),
            display: 'flex',
            justifyContent: 'space-between',
            gap: 20,
            alignItems: 'center',
            flexWrap: 'wrap',
            marginBottom: 18,
          }}
        >
          <div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 6 }}>
              AMMCO Intelligence
            </div>
            <h1 style={{ margin: 0, fontSize: 28 }}>لوحة الإدارة</h1>
            <p style={{ margin: '8px 0 0', color: '#475569' }}>
              أهلاً {displayName}
            </p>
          </div>
          <a
            href="/uploads"
            style={{
              textDecoration: 'none',
              background: '#0f766e',
              color: '#fff',
              padding: '11px 16px',
              borderRadius: 10,
              fontWeight: 700,
            }}
          >
            رفع شيت جديد
          </a>
        </header>

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 14,
            marginBottom: 18,
          }}
        >
          <div style={cardStyle()}>
            <div style={{ color: '#64748b', fontSize: 13 }}>الفروع النشطة</div>
            <div style={{ fontSize: 30, fontWeight: 800, marginTop: 8 }}>
              {branches.length}
            </div>
          </div>

          <div style={cardStyle()}>
            <div style={{ color: '#64748b', fontSize: 13 }}>آخر فترة معتمدة</div>
            <div style={{ fontSize: 17, fontWeight: 700, marginTop: 8 }}>
              {latestBatch
                ? `${latestBatch.period_start ?? '—'} إلى ${latestBatch.period_end ?? '—'}`
                : 'لا توجد دفعات معتمدة'}
            </div>
          </div>

          <div style={cardStyle()}>
            <div style={{ color: '#64748b', fontSize: 13 }}>آخر ملف معتمد</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 8, wordBreak: 'break-word' }}>
              {latestBatch?.original_file_name || '—'}
            </div>
          </div>
        </section>

        <section style={cardStyle()}>
          <h2 style={{ marginTop: 0, fontSize: 20 }}>أقسام النظام</h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 10,
            }}
          >
            {links.map(([label, href]) => (
              <a
                key={href}
                href={href}
                style={{
                  textDecoration: 'none',
                  color: '#0f172a',
                  border: '1px solid #cbd5e1',
                  borderRadius: 10,
                  padding: '13px 14px',
                  background: '#fff',
                  fontWeight: 700,
                }}
              >
                {label}
              </a>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}

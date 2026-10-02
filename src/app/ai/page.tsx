import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { AiDeveloperConsole } from '@/components/ai-developer-console'
import { getAiRuntimeStatus } from '@/lib/ai/provider'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function AiDeveloperPage() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims?.sub

  if (!userId) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('user_id', userId)
    .maybeSingle()

  if (!profile) {
    return (
      <AppShell title="AI Developer" subtitle="الحساب يحتاج تهيئة من مدير النظام">
        <div className="notice">تم تسجيل الدخول، لكن الحساب غير مربوط بملف مستخدم في AMMCO.</div>
      </AppShell>
    )
  }

  if (profile.role !== 'admin') {
    return (
      <AppShell title="AI Developer" subtitle="أداة تطوير داخلية محمية">
        <div className="notice">AI Developer متاح لحساب المدير فقط في هذه المرحلة.</div>
      </AppShell>
    )
  }

  const { error: healthError } = await supabase
    .from('organizations')
    .select('id', { count: 'exact', head: true })

  const aiStatus = getAiRuntimeStatus()

  return (
    <AppShell
      title="AI Developer"
      subtitle="مساعد تطوير AMMCO المتصل بالمستودع وقاعدة البيانات"
      breadcrumbs={[{ label: 'لوحة الإدارة', href: '/' }, { label: 'AI Developer' }]}
    >
      <AiDeveloperConsole
        repository="Premieros/AMMCO"
        databaseRef="yumeijsyiphzdsulsubf"
        databaseHealthy={!healthError}
        aiConfigured={aiStatus.configured}
        model={aiStatus.model}
      />
    </AppShell>
  )
}

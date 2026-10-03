import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { UploadForm } from '@/components/upload-form'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function UploadsPage({
  searchParams,
}: {
  searchParams: Promise<{
    branch?: string
    period_start?: string
    period_end?: string
    replace_batch_id?: string
    mode?: string
  }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims?.sub
  if (!userId) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle()

  if (!profile) {
    return (
      <AppShell title="رفع الشيت">
        <div className="notice">الحساب غير مهيأ داخل AMMCO.</div>
      </AppShell>
    )
  }

  const { data: branches } = await supabase
    .from('branches')
    .select('id, name, code')
    .eq('is_active', true)
    .order('name')

  const isReplaceMode = params.mode === 'replace'
  const branchName = branches?.find((b) => b.id === params.branch)?.name

  return (
    <AppShell
      title={isReplaceMode ? 'استبدال شيت الفرع بملف جديد' : 'رفع شيت جديد'}
      subtitle={
        isReplaceMode
          ? `استبدال بيانات شيت ${branchName ?? 'الفرع'} للفترة المحددة بملف محدث`
          : 'ملف Excel لكل فرع ولكل فترة'
      }
      breadcrumbs={[
        { label: 'لوحة الإدارة', href: '/' },
        { label: 'سجل الرفع', href: '/imports' },
        { label: isReplaceMode ? 'استبدال شيت' : 'رفع شيت' },
      ]}
    >
      <UploadForm
        branches={branches ?? []}
        defaultBranch={params.branch}
        defaultPeriodStart={params.period_start}
        defaultPeriodEnd={params.period_end}
        replaceBatchId={params.replace_batch_id}
        isReplaceMode={isReplaceMode}
      />
    </AppShell>
  )
}

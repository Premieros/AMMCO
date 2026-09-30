import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { UploadForm } from '@/components/upload-form'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function UploadsPage() {
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

  return (
    <AppShell title="رفع الشيت" subtitle="ملف Excel لكل فرع ولكل فترة">
      <UploadForm branches={branches ?? []} />
    </AppShell>
  )
}

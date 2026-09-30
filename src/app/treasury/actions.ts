'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function createTreasuryAccount(formData: FormData) {
  const branchId = String(formData.get('branch_id') ?? '')
  const code = String(formData.get('code') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  const accountType = String(formData.get('account_type') ?? 'cash')

  if (!branchId || !code || !name) {
    redirect('/treasury?error=' + encodeURIComponent('الفرع والكود والاسم مطلوبون'))
  }

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims?.sub
  if (!userId) redirect('/login')

  const [{ data: profile }, { data: branch }] = await Promise.all([
    supabase.from('profiles').select('organization_id,role').eq('user_id', userId).maybeSingle(),
    supabase.from('branches').select('id,organization_id').eq('id', branchId).maybeSingle(),
  ])

  if (!profile || profile.role !== 'admin' || !branch || branch.organization_id !== profile.organization_id) {
    redirect('/treasury?error=' + encodeURIComponent('غير مصرح بإضافة خزنة'))
  }

  const { error } = await supabase.from('treasury_accounts').insert({
    organization_id: profile.organization_id,
    branch_id: branchId,
    code,
    name,
    account_type: accountType,
    is_default: false,
    is_active: true,
    created_by: userId,
  })

  if (error) redirect('/treasury?error=' + encodeURIComponent(error.message))

  revalidatePath('/treasury')
  redirect('/treasury?success=' + encodeURIComponent('تمت إضافة الخزنة'))
}

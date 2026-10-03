'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function approveImport(formData: FormData) {
  const batchId = String(formData.get('batch_id') ?? '')
  if (!batchId) redirect('/imports?error=' + encodeURIComponent('نسخة غير صالحة'))

  const supabase = await createClient()
  const { error } = await supabase.rpc('approve_import_batch', { p_batch_id: batchId })

  if (error) redirect(`/imports/${batchId}?error=${encodeURIComponent(error.message)}`)

  revalidatePath('/')
  revalidatePath('/imports')
  revalidatePath('/sales')
  revalidatePath('/treasury')
  revalidatePath('/branches')
  revalidatePath('/products')
  revalidatePath('/branch-sheets')
  redirect(`/imports/${batchId}?success=${encodeURIComponent('تم اعتماد النسخة وتثبيت الأيام الجديدة')}`)
}

export async function deleteImportBatch(formData: FormData) {
  const batchId = String(formData.get('batch_id') ?? '')
  if (!batchId) redirect('/imports?error=' + encodeURIComponent('نسخة غير صالحة'))

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims?.sub
  if (!userId) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle()

  if (profile?.role !== 'admin') {
    redirect(`/imports/${batchId}?error=${encodeURIComponent('صلاحية المدير مطلوبة لحذف الشيتات')}`)
  }

  const admin = createAdminClient()

  // 1. Fetch batch to check branch and period
  const { data: batch } = await admin
    .from('import_batches')
    .select('id, branch_id, period_start, period_end, status')
    .eq('id', batchId)
    .maybeSingle()

  if (!batch) {
    redirect('/imports?error=' + encodeURIComponent('الشيت غير موجود'))
  }

  // 2. Clean up foreign key references to prevent RESTRICT errors
  await admin.from('branch_day_submissions').delete().eq('current_batch_id', batchId)
  await admin.from('import_day_changes').delete().eq('previous_batch_id', batchId)
  await admin.from('import_day_changes').delete().eq('batch_id', batchId)
  await admin.from('import_batches').update({ replaces_batch_id: null }).eq('replaces_batch_id', batchId)

  // 3. Delete the batch (cascades to all metrics, inventory, cash, etc.)
  const { error: delError } = await admin
    .from('import_batches')
    .delete()
    .eq('id', batchId)

  if (delError) {
    redirect(`/imports/${batchId}?error=${encodeURIComponent('فشل حذف الشيت: ' + delError.message)}`)
  }

  // 4. If the deleted batch was approved, restore the latest superseded version if one exists
  if (batch.status === 'approved') {
    const { data: prevBatch } = await admin
      .from('import_batches')
      .select('id')
      .eq('branch_id', batch.branch_id)
      .eq('period_start', batch.period_start)
      .eq('status', 'superseded')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (prevBatch) {
      await admin
        .from('import_batches')
        .update({ status: 'approved' })
        .eq('id', prevBatch.id)
    }
  }

  revalidatePath('/')
  revalidatePath('/imports')
  revalidatePath('/sales')
  revalidatePath('/treasury')
  revalidatePath('/branches')
  revalidatePath('/products')
  revalidatePath('/branch-sheets')
  redirect('/imports?success=' + encodeURIComponent('تم حذف الشيت وكافة البيانات المرتبطة به بنجاح'))
}


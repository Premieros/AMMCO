'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

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
  redirect(`/imports/${batchId}?success=${encodeURIComponent('تم اعتماد النسخة وتثبيت الأيام الجديدة')}`)
}

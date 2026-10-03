import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: batchId } = await params
    if (!batchId) {
      return NextResponse.json({ error: 'معرف الشيت غير صالح' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: auth } = await supabase.auth.getClaims()
    const userId = auth?.claims?.sub
    if (!userId) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle()

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'صلاحية المدير مطلوبة لحذف الشيتات' }, { status: 403 })
    }

    const admin = createAdminClient()

    // 1. Fetch batch to check branch and period
    const { data: batch } = await admin
      .from('import_batches')
      .select('id, branch_id, period_start, period_end, status')
      .eq('id', batchId)
      .maybeSingle()

    if (!batch) {
      return NextResponse.json({ error: 'الشيت غير موجود' }, { status: 404 })
    }

    // 2. Clean up foreign keys
    await admin.from('branch_day_submissions').delete().eq('current_batch_id', batchId)
    await admin.from('import_day_changes').delete().eq('previous_batch_id', batchId)
    await admin.from('import_day_changes').delete().eq('batch_id', batchId)
    await admin.from('import_batches').update({ replaces_batch_id: null }).eq('replaces_batch_id', batchId)

    // 3. Delete batch
    const { error: delError } = await admin
      .from('import_batches')
      .delete()
      .eq('id', batchId)

    if (delError) {
      return NextResponse.json({ error: 'فشل حذف الشيت: ' + delError.message }, { status: 500 })
    }

    // 4. Restore previous superseded batch if this was approved
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

    return NextResponse.json({ success: true, message: 'تم حذف الشيت بنجاح' })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'حدث خطأ أثناء الحذف'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

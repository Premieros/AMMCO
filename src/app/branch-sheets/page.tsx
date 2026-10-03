import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { BranchSheetEditor } from '@/components/branch-sheet-editor'
import { createClient } from '@/lib/supabase/server'
import { FileEdit, Upload, Trash2, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function BranchSheetsPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; batch?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims?.sub
  if (!userId) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('user_id', userId)
    .maybeSingle()

  if (!profile?.is_active) {
    return (
      <AppShell title="محتويات وتعديل شيتات الفروع">
        <div className="notice">الحساب غير مفعل أو غير مهيأ.</div>
      </AppShell>
    )
  }

  // 1. Fetch active branches
  const { data: branchesData } = await supabase
    .from('branches')
    .select('id, name, code')
    .eq('is_active', true)
    .order('name')

  const branches = branchesData ?? []
  if (branches.length === 0) {
    return (
      <AppShell title="محتويات وتعديل شيتات الفروع">
        <div className="notice">لا توجد فروع مسجلة بالنظام.</div>
      </AppShell>
    )
  }

  const selectedBranchId = params.branch || branches[0].id

  // 2. Fetch batches for the selected branch
  const { data: batchesData } = await supabase
    .from('import_batches')
    .select('id, branch_id, version, status, period_start, period_end, original_file_name, uploaded_at')
    .eq('branch_id', selectedBranchId)
    .order('uploaded_at', { ascending: false })

  const batches = batchesData ?? []

  // Resolve selected batch (default to approved or latest)
  let selectedBatch = batches.find((b) => b.id === params.batch)
  if (!selectedBatch) {
    selectedBatch = batches.find((b) => b.status === 'approved') || batches[0] || null
  }

  let inventoryRows: any[] = []
  let repRows: any[] = []
  let cashRows: any[] = []
  let warehouseRows: any[] = []
  let destinations: any[] = []

  if (selectedBatch) {
    const [
      { data: invData },
      { data: repsData },
      { data: cashData },
      { data: whData },
      { data: destsData },
    ] = await Promise.all([
      supabase
        .from('inventory_daily')
        .select('*')
        .eq('batch_id', selectedBatch.id)
        .order('business_date', { ascending: true })
        .order('product_name', { ascending: true })
        .limit(2000),
      supabase
        .from('sales_rep_daily')
        .select('*')
        .eq('batch_id', selectedBatch.id)
        .order('business_date', { ascending: true })
        .order('rep_name', { ascending: true })
        .limit(2000),
      supabase
        .from('cash_entries')
        .select('*')
        .eq('batch_id', selectedBatch.id)
        .order('entry_date', { ascending: false })
        .order('id', { ascending: false })
        .limit(2000),
      supabase
        .from('warehouse_daily_summary')
        .select('*')
        .eq('batch_id', selectedBatch.id)
        .order('business_date', { ascending: true })
        .limit(500),
      (supabase as any)
        .from('cash_destinations')
        .select('id, name, destination_type')
        .eq('is_active', true)
        .order('name'),
    ])

    inventoryRows = invData ?? []
    repRows = repsData ?? []
    cashRows = cashData ?? []
    warehouseRows = whData ?? []
    destinations = destsData ?? []
  }

  const selectedBranchName = branches.find((b) => b.id === selectedBranchId)?.name ?? ''

  return (
    <AppShell
      title="محتويات وتعديل شيتات الفروع"
      subtitle={`عرض كامل لبيانات شيت فرع ${selectedBranchName} مع إمكانية التعديل والحذف والاستبدال`}
      breadcrumbs={[
        { label: 'لوحة الإدارة', href: '/' },
        { label: 'سجل الرفع', href: '/imports' },
        { label: 'محتويات وتعديل الشيتات' },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <Link href="/uploads" className="btn-secondary-action">
            <Upload className="w-3.5 h-3.5" />
            <span>رفع شيت جديد</span>
          </Link>
          <Link href="/imports" className="btn-secondary-action">
            <span>سجل الرفع</span>
          </Link>
        </div>
      }
    >
      <BranchSheetEditor
        branches={branches}
        selectedBranchId={selectedBranchId}
        batches={batches}
        selectedBatch={selectedBatch}
        initialInventory={inventoryRows}
        initialReps={repRows}
        initialCash={cashRows}
        initialWarehouse={warehouseRows}
        destinations={destinations}
      />
    </AppShell>
  )
}

'use client'

import { useState, useEffect, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Save,
  Trash2,
  RefreshCw,
  Plus,
  Trash,
  Search,
  Filter,
  Package,
  Users,
  Wallet,
  Building2,
  AlertTriangle,
  CheckCircle2,
  Upload,
  Calendar,
  Layers,
  ArrowRight,
} from 'lucide-react'

interface Branch {
  id: string
  name: string
  code: string
}

interface Batch {
  id: string
  branch_id: string
  version: number
  status: string
  period_start: string
  period_end: string
  original_file_name: string
  uploaded_at: string
}

interface InventoryRow {
  id: number
  business_date: string
  product_id: string | null
  product_name: string
  barcode: string | null
  unit_value: number | null
  opening_qty: number
  incoming_factory_qty: number
  incoming_branches_qty: number
  sales_qty: number
  bonus_qty: number
  gifts_qty: number
  damages_qty: number
  return_factory_qty: number
  outgoing_branches_qty: number
  adjustments_qty: number
  closing_qty: number
  closing_value: number | null
}

interface RepRow {
  id: number
  business_date: string
  rep_name: string
  opening_balance: number
  sales_before_discount: number
  discounts: number
  net_after_discount: number
  deposit_amount: number
  expense_amount: number
  closing_balance: number
}

interface CashRow {
  id: number
  entry_date: string
  description: string | null
  category: string | null
  canonical_category: string | null
  expense_group: string | null
  amount: number
  direction: 'in' | 'out'
  running_balance: number | null
  is_expense: boolean
  destination_id: string | null
}

interface WarehouseRow {
  id: number
  business_date: string
  opening_qty: number
  opening_value: number
  incoming_factory_qty: number
  sales_qty: number
  sales_value: number
  bonus_qty: number
  damages_qty: number
  closing_qty: number
  closing_value: number
}

interface Destination {
  id: string
  name: string
  destination_type: string
}

interface Props {
  branches: Branch[]
  selectedBranchId: string
  batches: Batch[]
  selectedBatch: Batch | null
  initialInventory: InventoryRow[]
  initialReps: RepRow[]
  initialCash: CashRow[]
  initialWarehouse: WarehouseRow[]
  destinations: Destination[]
}

export function BranchSheetEditor({
  branches,
  selectedBranchId,
  batches,
  selectedBatch,
  initialInventory,
  initialReps,
  initialCash,
  initialWarehouse,
  destinations,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Active Tab
  const [activeTab, setActiveTab] = useState<'inventory' | 'reps' | 'cash' | 'warehouse'>('inventory')

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedDay, setSelectedDay] = useState<string>('all')

  // Data States
  const [inventory, setInventory] = useState<InventoryRow[]>(initialInventory)
  const [reps, setReps] = useState<RepRow[]>(initialReps)
  const [cash, setCash] = useState<CashRow[]>(initialCash)
  const [warehouse, setWarehouse] = useState<WarehouseRow[]>(initialWarehouse)

  // Track edits
  const [inventoryEdits, setInventoryEdits] = useState<Map<number, Partial<InventoryRow>>>(new Map())
  const [repEdits, setRepEdits] = useState<Map<number, Partial<RepRow>>>(new Map())
  const [cashEdits, setCashEdits] = useState<Map<number, Partial<CashRow>>>(new Map())
  const [warehouseEdits, setWarehouseEdits] = useState<Map<number, Partial<WarehouseRow>>>(new Map())
  const [cashDeletes, setCashDeletes] = useState<Set<number>>(new Set())
  const [cashNew, setCashNew] = useState<Array<Omit<CashRow, 'id' | 'running_balance'>>>([])

  // UI state
  const [saving, setSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showReplaceModal, setShowReplaceModal] = useState(false)
  const [showAddCashModal, setShowAddCashModal] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // New Cash form
  const [newCashEntry, setNewCashEntry] = useState({
    entry_date: selectedBatch?.period_start || new Date().toISOString().slice(0, 10),
    description: '',
    amount: '',
    direction: 'out' as 'in' | 'out',
    canonical_category: 'تشغيل',
    is_expense: true,
    destination_id: '',
  })

  // Calculate unique days for day filter
  const allDays = Array.from(
    new Set([
      ...inventory.map((r) => r.business_date),
      ...reps.map((r) => r.business_date),
      ...cash.map((r) => r.entry_date),
      ...warehouse.map((r) => r.business_date),
    ])
  ).sort()

  const dirtyCount =
    inventoryEdits.size + repEdits.size + cashEdits.size + warehouseEdits.size + cashDeletes.size + cashNew.length

  // Handlers for branch/batch navigation
  const handleBranchChange = (branchId: string) => {
    startTransition(() => {
      router.push(`/branch-sheets?branch=${branchId}`)
    })
  }

  const handleBatchChange = (batchId: string) => {
    startTransition(() => {
      router.push(`/branch-sheets?branch=${selectedBranchId}&batch=${batchId}`)
    })
  }

  // Inventory Edits
  const handleInventoryCellChange = (
    rowId: number,
    field: keyof InventoryRow,
    value: number | string
  ) => {
    setInventory((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row
        const updated = { ...row, [field]: value }
        if (field === 'unit_value' || field === 'closing_qty') {
          const uv = field === 'unit_value' ? Number(value) : (row.unit_value ?? 0)
          const cq = field === 'closing_qty' ? Number(value) : row.closing_qty
          updated.closing_value = Math.round(uv * cq * 100) / 100
        }
        return updated
      })
    )

    setInventoryEdits((prev) => {
      const next = new Map(prev)
      const current = next.get(rowId) || {}
      next.set(rowId, { ...current, [field]: value })
      return next
    })
  }

  // Rep Edits
  const handleRepCellChange = (rowId: number, field: keyof RepRow, value: number | string) => {
    setReps((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row
        const updated = { ...row, [field]: value }
        if (field === 'sales_before_discount' || field === 'discounts') {
          const s = field === 'sales_before_discount' ? Number(value) : row.sales_before_discount
          const d = field === 'discounts' ? Number(value) : row.discounts
          updated.net_after_discount = s - d
        }
        return updated
      })
    )

    setRepEdits((prev) => {
      const next = new Map(prev)
      const current = next.get(rowId) || {}
      next.set(rowId, { ...current, [field]: value })
      return next
    })
  }

  // Cash Edits
  const handleCashCellChange = (
    rowId: number,
    field: keyof CashRow,
    value: string | number | boolean | null
  ) => {
    setCash((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row
        return { ...row, [field]: value }
      })
    )

    setCashEdits((prev) => {
      const next = new Map(prev)
      const current = next.get(rowId) || {}
      next.set(rowId, { ...current, [field]: value })
      return next
    })
  }

  const handleDeleteCashRow = (rowId: number) => {
    setCash((prev) => prev.filter((r) => r.id !== rowId))
    setCashDeletes((prev) => new Set(prev).add(rowId))
  }

  // Add new cash entry
  const handleAddNewCash = () => {
    if (!newCashEntry.description || !newCashEntry.amount) {
      alert('يرجى كتابة البيان والقيمة')
      return
    }

    const created: Omit<CashRow, 'id' | 'running_balance'> = {
      entry_date: newCashEntry.entry_date,
      description: newCashEntry.description,
      category: newCashEntry.canonical_category,
      canonical_category: newCashEntry.canonical_category,
      expense_group: null,
      amount: Number(newCashEntry.amount),
      direction: newCashEntry.direction,
      is_expense: newCashEntry.is_expense,
      destination_id: newCashEntry.destination_id || null,
    }

    setCashNew((prev) => [...prev, created])
    // Optimistically add to UI list with temp ID
    setCash((prev) => [
      {
        id: -Date.now(),
        ...created,
        running_balance: 0,
      },
      ...prev,
    ])

    setShowAddCashModal(false)
    setNewCashEntry({
      entry_date: selectedBatch?.period_start || new Date().toISOString().slice(0, 10),
      description: '',
      amount: '',
      direction: 'out',
      canonical_category: 'تشغيل',
      is_expense: true,
      destination_id: '',
    })
  }

  // Save all changes
  const handleSaveAll = async () => {
    if (!selectedBatch) return
    setSaving(true)
    setStatusMessage(null)

    try {
      const payload = {
        batchId: selectedBatch.id,
        branchId: selectedBranchId,
        inventoryEdits: Array.from(inventoryEdits.entries()).map(([id, edits]) => ({ id, ...edits })),
        repEdits: Array.from(repEdits.entries()).map(([id, edits]) => ({ id, ...edits })),
        cashEdits: Array.from(cashEdits.entries()).map(([id, edits]) => ({ id, ...edits })),
        cashDeletes: Array.from(cashDeletes),
        cashNew: cashNew.map((entry) => ({
          ...entry,
          branch_id: selectedBranchId,
          batch_id: selectedBatch.id,
        })),
        warehouseEdits: Array.from(warehouseEdits.entries()).map(([id, edits]) => ({ id, ...edits })),
      }

      const res = await fetch('/api/branch-sheets/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل حفظ التعديلات')

      setStatusMessage({ type: 'success', text: data.message || 'تم حفظ كافة التعديلات بنجاح' })
      setInventoryEdits(new Map())
      setRepEdits(new Map())
      setCashEdits(new Map())
      setWarehouseEdits(new Map())
      setCashDeletes(new Set())
      setCashNew([])

      // Refresh data
      router.refresh()
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'حدث خطأ أثناء حفظ التعديلات',
      })
    } finally {
      setSaving(false)
    }
  }

  // Ctrl+S / Cmd+S shortcut to save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (dirtyCount > 0 && !saving) {
          handleSaveAll()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [dirtyCount, saving, inventoryEdits, repEdits, cashEdits, warehouseEdits, cashDeletes, cashNew, selectedBatch, selectedBranchId])

  // Live Summary calculation
  const metricsSummary = useMemo(() => {
    const grossSales = reps.reduce((s, r) => s + Number(r.sales_before_discount || 0), 0)
    const netSales = reps.reduce((s, r) => s + Number(r.net_after_discount || 0), 0)
    const discounts = reps.reduce((s, r) => s + Number(r.discounts || 0), 0)
    const collections = reps.reduce((s, r) => s + Number(r.deposit_amount || 0), 0)
    const expenses = cash.filter((c) => c.is_expense).reduce((s, c) => s + Number(c.amount || 0), 0)
    const cashInTotal = cash.filter((c) => c.direction === 'in').reduce((s, c) => s + Number(c.amount || 0), 0)
    const uniqueProducts = new Set(inventory.map((r) => r.product_name)).size
    const uniqueReps = new Set(reps.map((r) => r.rep_name)).size

    return {
      grossSales,
      netSales,
      discounts,
      collections,
      expenses,
      cashInTotal,
      uniqueProducts,
      uniqueReps,
    }
  }, [reps, cash, inventory])

  // Delete Batch
  const handleDeleteBatch = async () => {
    if (!selectedBatch) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/imports/${selectedBatch.id}/delete`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل حذف الشيت')

      setShowDeleteModal(false)
      window.location.assign(`/branch-sheets?branch=${encodeURIComponent(selectedBranchId)}`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'فشل حذف الشيت')
    } finally {
      setDeleting(false)
    }
  }

  // Filtered views
  const filteredInventory = inventory.filter((r) => {
    if (selectedDay !== 'all' && r.business_date !== selectedDay) return false
    if (!searchTerm) return true
    const q = searchTerm.toLowerCase()
    return r.product_name.toLowerCase().includes(q) || (r.barcode && r.barcode.includes(q))
  })

  const filteredReps = reps.filter((r) => {
    if (selectedDay !== 'all' && r.business_date !== selectedDay) return false
    if (!searchTerm) return true
    return r.rep_name.toLowerCase().includes(searchTerm.toLowerCase())
  })

  const filteredCash = cash.filter((r) => {
    if (selectedDay !== 'all' && r.entry_date !== selectedDay) return false
    if (!searchTerm) return true
    const q = searchTerm.toLowerCase()
    return (
      (r.description && r.description.toLowerCase().includes(q)) ||
      (r.canonical_category && r.canonical_category.toLowerCase().includes(q))
    )
  })

  const filteredWarehouse = warehouse.filter((r) => {
    if (selectedDay !== 'all' && r.business_date !== selectedDay) return false
    return true
  })

  const activeBranch = branches.find((b) => b.id === selectedBranchId)

  return (
    <div className="sheet-editor-workspace">
      {/* 1. Branch & Batch Header Selector Bar */}
      <section className="card sheet-selector-bar">
        <div className="selector-bar-grid">
          <div className="field">
            <label>الفرع</label>
            <select
              value={selectedBranchId}
              onChange={(e) => handleBranchChange(e.target.value)}
              className="styled-select"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>الدفعة / النسخة المرفوعة</label>
            <select
              value={selectedBatch?.id || ''}
              onChange={(e) => handleBatchChange(e.target.value)}
              className="styled-select"
              disabled={batches.length === 0}
            >
              {batches.length === 0 ? (
                <option value="">لا توجد شيتات مرفوعة لهذا الفرع</option>
              ) : (
                batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.original_file_name} (v{b.version}) - {b.status === 'approved' ? 'معتمد' : b.status}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="field">
            <label>تصفية بيوم محدد</label>
            <select
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
              className="styled-select"
            >
              <option value="all">كل أيام الفترة ({allDays.length} يوم)</option>
              {allDays.map((d) => (
                <option key={d} value={d}>
                  يوم: {d}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>بحث في المحتويات</label>
            <div className="search-input-wrap">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="اسم الصنف، المندوب، البيان..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-field"
              />
            </div>
          </div>
        </div>

        {/* Action Controls for the Batch */}
        {selectedBatch && (
          <div className="batch-actions-row">
            <div className="batch-meta-tags">
              <span className={`pill-badge ${selectedBatch.status === 'approved' ? 'pill-green' : 'pill-gold'}`}>
                {selectedBatch.status === 'approved' ? 'معتمد رسمياً' : selectedBatch.status}
              </span>
              <span className="scope-chip">
                الفترة: <strong>{selectedBatch.period_start} → {selectedBatch.period_end}</strong>
              </span>
              <span className="scope-chip">
                الإصدار: <strong>v{selectedBatch.version}</strong>
              </span>
            </div>

            <div className="batch-action-buttons">
              <button
                type="button"
                className="btn btn-save-action"
                onClick={handleSaveAll}
                disabled={saving || dirtyCount === 0}
              >
                <Save className="w-4 h-4" />
                <span>{saving ? 'جاري الحفظ...' : `حفظ التعديلات ${dirtyCount > 0 ? `(${dirtyCount})` : ''}`}</span>
              </button>

              <button
                type="button"
                className="btn btn-secondary-action"
                onClick={() => setShowReplaceModal(true)}
              >
                <RefreshCw className="w-4 h-4 text-sky-600" />
                <span>استبدال الشيت</span>
              </button>

              <button
                type="button"
                className="btn btn-danger-action"
                onClick={() => setShowDeleteModal(true)}
              >
                <Trash2 className="w-4 h-4" />
                <span>حذف الشيت</span>
              </button>

              <Link
                href={`/api/export?branch=${selectedBranchId}&from=${selectedBatch.period_start}&to=${selectedBatch.period_end}&type=sales`}
                className="btn btn-secondary-action"
              >
                <span>تصدير Excel</span>
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* Notifications */}
      {statusMessage && (
        <div className={`editor-alert ${statusMessage.type === 'success' ? 'alert-success' : 'alert-error'}`}>
          {statusMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          <span>{statusMessage.text}</span>
          <button type="button" onClick={() => setStatusMessage(null)} className="alert-close-btn">
            ✕
          </button>
        </div>
      )}

      {/* Live KPIs summary bar */}
      {selectedBatch && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-3">
          <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-xs">
            <span className="text-[10.5px] text-slate-500 block font-medium">صافي المبيعات</span>
            <strong className="text-sm text-emerald-700 block font-bold font-mono">
              {new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(metricsSummary.netSales)} EGP
            </strong>
          </div>
          <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-xs">
            <span className="text-[10.5px] text-slate-500 block font-medium">إجمالي المبيعات</span>
            <strong className="text-sm text-slate-800 block font-bold font-mono">
              {new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(metricsSummary.grossSales)} EGP
            </strong>
          </div>
          <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-xs">
            <span className="text-[10.5px] text-slate-500 block font-medium">إجمالي الخصومات</span>
            <strong className="text-sm text-amber-700 block font-bold font-mono">
              {new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(metricsSummary.discounts)} EGP
            </strong>
          </div>
          <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-xs">
            <span className="text-[10.5px] text-slate-500 block font-medium">التوريد / التحصيل</span>
            <strong className="text-sm text-blue-700 block font-bold font-mono">
              {new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(metricsSummary.collections)} EGP
            </strong>
          </div>
          <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-xs">
            <span className="text-[10.5px] text-slate-500 block font-medium">المصروفات النقدية</span>
            <strong className="text-sm text-rose-700 block font-bold font-mono">
              {new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(metricsSummary.expenses)} EGP
            </strong>
          </div>
          <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-xs">
            <span className="text-[10.5px] text-slate-500 block font-medium">الأصناف والمناديب</span>
            <strong className="text-xs text-slate-700 block font-bold mt-0.5">
              {metricsSummary.uniqueProducts} صنف · {metricsSummary.uniqueReps} مندوب
            </strong>
          </div>
        </div>
      )}

      {/* 2. Sheet Tabs */}
      <div className="sheet-editor-tabs-bar">
        <button
          type="button"
          className={`sheet-tab-btn ${activeTab === 'inventory' ? 'active' : ''}`}
          onClick={() => setActiveTab('inventory')}
        >
          <Package className="w-4 h-4" />
          <span>حركة المخزن والأصناف ({filteredInventory.length})</span>
        </button>

        <button
          type="button"
          className={`sheet-tab-btn ${activeTab === 'reps' ? 'active' : ''}`}
          onClick={() => setActiveTab('reps')}
        >
          <Users className="w-4 h-4" />
          <span>المناديب والتوريدات ({filteredReps.length})</span>
        </button>

        <button
          type="button"
          className={`sheet-tab-btn ${activeTab === 'cash' ? 'active' : ''}`}
          onClick={() => setActiveTab('cash')}
        >
          <Wallet className="w-4 h-4" />
          <span>يومية الخزينة والمصروفات ({filteredCash.length})</span>
        </button>

        <button
          type="button"
          className={`sheet-tab-btn ${activeTab === 'warehouse' ? 'active' : ''}`}
          onClick={() => setActiveTab('warehouse')}
        >
          <Layers className="w-4 h-4" />
          <span>ملخص المخزن اليومي ({filteredWarehouse.length})</span>
        </button>
      </div>

      {/* 3. Tab Contents */}

      {/* TAB 1: INVENTORY & PRODUCTS */}
      {activeTab === 'inventory' && (
        <section className="card table-card sheet-content-card">
          <div className="table-head">
            <div>
              <h2>كشف الأصناف وحركة المخزن اليومية للفرع</h2>
              <small>يمكنك تعديل كميات البيع وسعر الوحدة ورصيد آخر مباشرة</small>
            </div>
          </div>
          <div className="table-wrap editor-table-wrap">
            <table className="editor-table">
              <thead>
                <tr>
                  <th>اليوم</th>
                  <th>اسم الصنف</th>
                  <th>الباركود</th>
                  <th>سعر الوحدة (EGP)</th>
                  <th>رصيد أول</th>
                  <th>وارد مصنع</th>
                  <th>مبيعات (كمية)</th>
                  <th>بوانص</th>
                  <th>توالف</th>
                  <th>مرتجع</th>
                  <th>رصيد آخر</th>
                  <th>قيمة الرصيد (EGP)</th>
                </tr>
              </thead>
              <tbody>
                {filteredInventory.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="empty-notice">
                      لا توجد بيانات للأصناف في الفترة أو اليوم المحدد
                    </td>
                  </tr>
                ) : (
                  filteredInventory.map((row) => {
                    const isDirty = inventoryEdits.has(row.id)
                    return (
                      <tr key={row.id} className={isDirty ? 'row-edited' : ''}>
                        <td className="date-cell">{row.business_date}</td>
                        <td className="name-cell font-bold">{row.product_name}</td>
                        <td className="barcode-cell">{row.barcode || '—'}</td>
                        <td className="num-cell">
                          <input
                            type="number"
                            step="0.01"
                            value={row.unit_value ?? ''}
                            onChange={(e) =>
                              handleInventoryCellChange(row.id, 'unit_value', parseFloat(e.target.value) || 0)
                            }
                            className="cell-input"
                          />
                        </td>
                        <td className="num-cell">{row.opening_qty}</td>
                        <td className="num-cell">
                          <input
                            type="number"
                            step="0.1"
                            value={row.incoming_factory_qty}
                            onChange={(e) =>
                              handleInventoryCellChange(row.id, 'incoming_factory_qty', parseFloat(e.target.value) || 0)
                            }
                            className="cell-input"
                          />
                        </td>
                        <td className="num-cell highlight-cell">
                          <input
                            type="number"
                            step="0.1"
                            value={row.sales_qty}
                            onChange={(e) =>
                              handleInventoryCellChange(row.id, 'sales_qty', parseFloat(e.target.value) || 0)
                            }
                            className="cell-input font-bold text-emerald-800"
                          />
                        </td>
                        <td className="num-cell">
                          <input
                            type="number"
                            step="0.1"
                            value={row.bonus_qty}
                            onChange={(e) =>
                              handleInventoryCellChange(row.id, 'bonus_qty', parseFloat(e.target.value) || 0)
                            }
                            className="cell-input"
                          />
                        </td>
                        <td className="num-cell">
                          <input
                            type="number"
                            step="0.1"
                            value={row.damages_qty}
                            onChange={(e) =>
                              handleInventoryCellChange(row.id, 'damages_qty', parseFloat(e.target.value) || 0)
                            }
                            className="cell-input"
                          />
                        </td>
                        <td className="num-cell">{row.return_factory_qty}</td>
                        <td className="num-cell">
                          <input
                            type="number"
                            step="0.1"
                            value={row.closing_qty}
                            onChange={(e) =>
                              handleInventoryCellChange(row.id, 'closing_qty', parseFloat(e.target.value) || 0)
                            }
                            className="cell-input font-bold"
                          />
                        </td>
                        <td className="num-cell font-bold">
                          {new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(row.closing_value || 0)}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 2: SALES REPS */}
      {activeTab === 'reps' && (
        <section className="card table-card sheet-content-card">
          <div className="table-head">
            <div>
              <h2>شيت المناديب والتوريدات اليومية</h2>
              <small>تعديل مبيعات المندوب، الخصم، التوريد، ومصروفات المندوب</small>
            </div>
          </div>
          <div className="table-wrap editor-table-wrap">
            <table className="editor-table">
              <thead>
                <tr>
                  <th>اليوم</th>
                  <th>اسم المندوب</th>
                  <th>رصيد أول</th>
                  <th>مبيعات قبل الخصم (EGP)</th>
                  <th>الخصومات (EGP)</th>
                  <th>صافي المبيعات (EGP)</th>
                  <th>التوريد / التحصيل (EGP)</th>
                  <th>مصروفات المندوب (EGP)</th>
                  <th>رصيد آخر</th>
                </tr>
              </thead>
              <tbody>
                {filteredReps.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="empty-notice">
                      لا توجد بيانات للمناديب في الفترة المحددة
                    </td>
                  </tr>
                ) : (
                  filteredReps.map((row) => {
                    const isDirty = repEdits.has(row.id)
                    return (
                      <tr key={row.id} className={isDirty ? 'row-edited' : ''}>
                        <td className="date-cell">{row.business_date}</td>
                        <td className="name-cell font-bold">
                          <input
                            type="text"
                            value={row.rep_name}
                            onChange={(e) => handleRepCellChange(row.id, 'rep_name', e.target.value)}
                            className="cell-input-text font-bold"
                          />
                        </td>
                        <td className="num-cell">
                          <input
                            type="number"
                            step="0.01"
                            value={row.opening_balance}
                            onChange={(e) =>
                              handleRepCellChange(row.id, 'opening_balance', parseFloat(e.target.value) || 0)
                            }
                            className="cell-input"
                          />
                        </td>
                        <td className="num-cell">
                          <input
                            type="number"
                            step="0.01"
                            value={row.sales_before_discount}
                            onChange={(e) =>
                              handleRepCellChange(row.id, 'sales_before_discount', parseFloat(e.target.value) || 0)
                            }
                            className="cell-input font-bold"
                          />
                        </td>
                        <td className="num-cell">
                          <input
                            type="number"
                            step="0.01"
                            value={row.discounts}
                            onChange={(e) =>
                              handleRepCellChange(row.id, 'discounts', parseFloat(e.target.value) || 0)
                            }
                            className="cell-input"
                          />
                        </td>
                        <td className="num-cell font-bold text-emerald-700">
                          {new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(row.net_after_discount)}
                        </td>
                        <td className="num-cell highlight-cell">
                          <input
                            type="number"
                            step="0.01"
                            value={row.deposit_amount}
                            onChange={(e) =>
                              handleRepCellChange(row.id, 'deposit_amount', parseFloat(e.target.value) || 0)
                            }
                            className="cell-input font-bold text-blue-800"
                          />
                        </td>
                        <td className="num-cell">
                          <input
                            type="number"
                            step="0.01"
                            value={row.expense_amount}
                            onChange={(e) =>
                              handleRepCellChange(row.id, 'expense_amount', parseFloat(e.target.value) || 0)
                            }
                            className="cell-input"
                          />
                        </td>
                        <td className="num-cell font-bold">
                          <input
                            type="number"
                            step="0.01"
                            value={row.closing_balance}
                            onChange={(e) =>
                              handleRepCellChange(row.id, 'closing_balance', parseFloat(e.target.value) || 0)
                            }
                            className="cell-input font-bold"
                          />
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 3: TREASURY & CASH ENTRIES */}
      {activeTab === 'cash' && (
        <section className="card table-card sheet-content-card">
          <div className="table-head">
            <div>
              <h2>شيت حركة الخزينة والمصروفات</h2>
              <small>إضافة أو حذف أو تعديل بنود النقدية والمصروفات وتوجيهاتها</small>
            </div>
            <div>
              <button
                type="button"
                className="btn btn-primary-action"
                onClick={() => setShowAddCashModal(true)}
              >
                <Plus className="w-4 h-4" />
                <span>إضافة حركة نقدية</span>
              </button>
            </div>
          </div>
          <div className="table-wrap editor-table-wrap">
            <table className="editor-table">
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>البيان</th>
                  <th>التصنيف المعتمد</th>
                  <th>الاتجاه</th>
                  <th>القيمة (EGP)</th>
                  <th>هل هو مصروف؟</th>
                  <th>التوجيه</th>
                  <th>إجراء</th>
                </tr>
              </thead>
              <tbody>
                {filteredCash.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="empty-notice">
                      لا توجد حركات نقدية في الفترة المحددة
                    </td>
                  </tr>
                ) : (
                  filteredCash.map((row) => {
                    const isDirty = cashEdits.has(row.id)
                    return (
                      <tr key={row.id} className={isDirty ? 'row-edited' : ''}>
                        <td className="date-cell">
                          <input
                            type="date"
                            value={row.entry_date}
                            onChange={(e) => handleCashCellChange(row.id, 'entry_date', e.target.value)}
                            className="cell-input-date"
                          />
                        </td>
                        <td className="name-cell">
                          <input
                            type="text"
                            value={row.description || ''}
                            onChange={(e) => handleCashCellChange(row.id, 'description', e.target.value)}
                            className="cell-input-text font-bold"
                          />
                        </td>
                        <td>
                          <select
                            value={row.canonical_category || 'أخرى'}
                            onChange={(e) => handleCashCellChange(row.id, 'canonical_category', e.target.value)}
                            className="cell-select"
                          >
                            <option value="تشغيل">تشغيل</option>
                            <option value="نقل">نقل</option>
                            <option value="مرتبات">مرتبات</option>
                            <option value="صيانة">صيانة</option>
                            <option value="إيجارات">إيجارات</option>
                            <option value="تسويق">تسويق</option>
                            <option value="إدارية">إدارية</option>
                            <option value="توريد مندوب">توريد مندوب</option>
                            <option value="ايداع بنكي">ايداع بنكي</option>
                            <option value="تحويل للمصنع">تحويل للمصنع</option>
                            <option value="أخرى">أخرى</option>
                          </select>
                        </td>
                        <td>
                          <select
                            value={row.direction}
                            onChange={(e) => handleCashCellChange(row.id, 'direction', e.target.value as 'in' | 'out')}
                            className="cell-select"
                          >
                            <option value="in">داخل (إيراد/تحصيل)</option>
                            <option value="out">خارج (صرف/إيداع)</option>
                          </select>
                        </td>
                        <td className="num-cell highlight-cell">
                          <input
                            type="number"
                            step="0.01"
                            value={row.amount}
                            onChange={(e) =>
                              handleCashCellChange(row.id, 'amount', parseFloat(e.target.value) || 0)
                            }
                            className={`cell-input font-bold ${row.direction === 'in' ? 'text-blue-800' : 'text-rose-800'}`}
                          />
                        </td>
                        <td className="center-cell">
                          <input
                            type="checkbox"
                            checked={row.is_expense}
                            onChange={(e) => handleCashCellChange(row.id, 'is_expense', e.target.checked)}
                            className="styled-checkbox"
                          />
                        </td>
                        <td>
                          <select
                            value={row.destination_id || ''}
                            onChange={(e) => handleCashCellChange(row.id, 'destination_id', e.target.value || null)}
                            className="cell-select"
                          >
                            <option value="">بدون توجيه</option>
                            {destinations.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name} ({d.destination_type})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="action-cell">
                          <button
                            type="button"
                            onClick={() => handleDeleteCashRow(row.id)}
                            className="btn-icon-danger"
                            title="حذف هذه الحركة"
                          >
                            <Trash className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 4: WAREHOUSE SUMMARY */}
      {activeTab === 'warehouse' && (
        <section className="card table-card sheet-content-card">
          <div className="table-head">
            <div>
              <h2>ملخص حركة المخزن اليومي</h2>
              <small>إجماليات حركة المخزن لكل يوم</small>
            </div>
          </div>
          <div className="table-wrap editor-table-wrap">
            <table className="editor-table">
              <thead>
                <tr>
                  <th>اليوم</th>
                  <th>رصيد أول كمية</th>
                  <th>رصيد أول قيمة</th>
                  <th>وارد مصنع</th>
                  <th>مبيعات كمية</th>
                  <th>مبيعات قيمة (EGP)</th>
                  <th>بوانص</th>
                  <th>توالف</th>
                  <th>رصيد آخر كمية</th>
                  <th>قيمة رصيد آخر (EGP)</th>
                </tr>
              </thead>
              <tbody>
                {filteredWarehouse.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="empty-notice">
                      لا توجد بيانات ملخص المخزن في الفترة المحددة
                    </td>
                  </tr>
                ) : (
                  filteredWarehouse.map((row) => (
                    <tr key={row.id}>
                      <td className="date-cell">{row.business_date}</td>
                      <td className="num-cell">{row.opening_qty}</td>
                      <td className="num-cell">{row.opening_value}</td>
                      <td className="num-cell">{row.incoming_factory_qty}</td>
                      <td className="num-cell font-bold text-emerald-800">{row.sales_qty}</td>
                      <td className="num-cell font-bold">{row.sales_value}</td>
                      <td className="num-cell">{row.bonus_qty}</td>
                      <td className="num-cell">{row.damages_qty}</td>
                      <td className="num-cell font-bold">{row.closing_qty}</td>
                      <td className="num-cell font-bold">{row.closing_value}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* MODAL: DELETE SHEET CONFIRMATION */}
      {showDeleteModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <AlertTriangle className="w-6 h-6 text-rose-600" />
              <h3>تأكيد حذف الشيت بالكامل</h3>
            </div>
            <div className="modal-body">
              <p>
                هل أنت متأكد من رغبتك في حذف شيت الفرع:{' '}
                <strong>{activeBranch?.name}</strong>؟
              </p>
              <p className="text-rose-700 text-sm mt-2">
                سيتم حذف كافة سجلات المبيعات، المناديب، حركة المخزن، ويومية الخزينة المرتبطة بهذا الشيت نهائياً.
              </p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary-action"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
              >
                إلغاء
              </button>
              <button
                type="button"
                className="btn btn-danger-action"
                onClick={handleDeleteBatch}
                disabled={deleting}
              >
                {deleting ? 'جاري الحذف...' : 'نعم، احذف الشيت الآن'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: REPLACE SHEET (GO TO UPLOAD WITH REPLACE PARAMS) */}
      {showReplaceModal && selectedBatch && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <RefreshCw className="w-6 h-6 text-sky-600" />
              <h3>استبدال شيت الفرع بملف جديد</h3>
            </div>
            <div className="modal-body">
              <p>
                سيتم استبدال الشيت الحالي لفرع: <strong>{activeBranch?.name}</strong> للفترة:{' '}
                <strong>{selectedBatch.period_start} إلى {selectedBatch.period_end}</strong>.
              </p>
              <p className="text-slate-600 text-sm mt-2">
                النسخة الجديدة ستحل محل البيانات الحالية بشكل كامل وتعتمد تلقائياً.
              </p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary-action"
                onClick={() => setShowReplaceModal(false)}
              >
                إلغاء
              </button>
              <Link
                href={`/uploads?branch=${selectedBranchId}&period_start=${selectedBatch.period_start}&period_end=${selectedBatch.period_end}&replace_batch_id=${selectedBatch.id}&mode=replace`}
                className="btn btn-primary-action"
              >
                المتابعة لرفع الملف الجديد
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD CASH ENTRY */}
      {showAddCashModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <Plus className="w-6 h-6 text-emerald-600" />
              <h3>إضافة حركة نقدية إلى الشيت</h3>
            </div>
            <div className="modal-body form-grid-2">
              <div className="field">
                <label>التاريخ</label>
                <input
                  type="date"
                  value={newCashEntry.entry_date}
                  onChange={(e) => setNewCashEntry({ ...newCashEntry, entry_date: e.target.value })}
                  className="styled-input"
                />
              </div>

              <div className="field">
                <label>نوع الحركة</label>
                <select
                  value={newCashEntry.direction}
                  onChange={(e) =>
                    setNewCashEntry({
                      ...newCashEntry,
                      direction: e.target.value as 'in' | 'out',
                      is_expense: e.target.value === 'out',
                    })
                  }
                  className="styled-select"
                >
                  <option value="out">خارج (صرف / مصروف / إيداع)</option>
                  <option value="in">داخل (توريد / تحصيل / إيراد)</option>
                </select>
              </div>

              <div className="field col-span-2">
                <label>البيان / الوصف</label>
                <input
                  type="text"
                  placeholder="مثال: فاتورة صيانة سيارة نقل، إيجار مقر..."
                  value={newCashEntry.description}
                  onChange={(e) => setNewCashEntry({ ...newCashEntry, description: e.target.value })}
                  className="styled-input"
                />
              </div>

              <div className="field">
                <label>المبلغ (EGP)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={newCashEntry.amount}
                  onChange={(e) => setNewCashEntry({ ...newCashEntry, amount: e.target.value })}
                  className="styled-input font-bold"
                />
              </div>

              <div className="field">
                <label>التصنيف المعتمد</label>
                <select
                  value={newCashEntry.canonical_category}
                  onChange={(e) => setNewCashEntry({ ...newCashEntry, canonical_category: e.target.value })}
                  className="styled-select"
                >
                  <option value="تشغيل">تشغيل</option>
                  <option value="نقل">نقل</option>
                  <option value="مرتبات">مرتبات</option>
                  <option value="صيانة">صيانة</option>
                  <option value="إيجارات">إيجارات</option>
                  <option value="تسويق">تسويق</option>
                  <option value="إدارية">إدارية</option>
                  <option value="توريد مندوب">توريد مندوب</option>
                  <option value="ايداع بنكي">ايداع بنكي</option>
                  <option value="تحويل للمصنع">تحويل للمصنع</option>
                  <option value="أخرى">أخرى</option>
                </select>
              </div>

              <div className="field col-span-2">
                <label>التوجيه (اختياري)</label>
                <select
                  value={newCashEntry.destination_id}
                  onChange={(e) => setNewCashEntry({ ...newCashEntry, destination_id: e.target.value })}
                  className="styled-select"
                >
                  <option value="">بدون توجيه</option>
                  {destinations.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.destination_type})
                    </option>
                  ))}
                </select>
              </div>

              <div className="field col-span-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="chk-expense"
                  checked={newCashEntry.is_expense}
                  onChange={(e) => setNewCashEntry({ ...newCashEntry, is_expense: e.target.checked })}
                  className="styled-checkbox"
                />
                <label htmlFor="chk-expense" className="cursor-pointer">
                  احتساب هذا البند ضمن تقرير المصروفات
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary-action"
                onClick={() => setShowAddCashModal(false)}
              >
                إلغاء
              </button>
              <button
                type="button"
                className="btn btn-primary-action"
                onClick={handleAddNewCash}
              >
                إضافة الحركة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

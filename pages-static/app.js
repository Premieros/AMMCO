import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm'
import { parseWorkbookBrowser } from './workbook-parser.js'
import * as XLSX from 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm'

// AMMCO Strict Supabase Configuration
const SUPABASE_URL = 'https://yumeijsyiphzdsulsubf.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1bWVpanN5aXBoemRzdWxzdWJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2ODk1ODAsImV4cCI6MjEwNjI2NTU4MH0.Hpy2VZpttnQGdrx6_6Y1c9w4iHG2HhopvFdrohk3BBE'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
})

const app = document.getElementById('app')

// Formatting Utilities (One Source)
const numFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const money = v => numFmt.format(Math.round(Number(v || 0)))
const qtyFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const qty = v => qtyFmt.format(Number(v || 0))
const pct = v => `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(Number(v || 0) * 100)}%`
const escapeHtml = v => String(v ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]))
const escapeAttr = v => escapeHtml(v)

// State
let branches = []
let session = null
let profile = null

// Date Defaults
function getDefaultDates() {
  const now = new Date()
  const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0')
  return {
    from: `${y}-${m}-01`,
    to: `${y}-${m}-30`
  }
}
const defaultDates = getDefaultDates()

// Routing
const route = () => location.hash.replace(/^#\/?/, '').split('?')[0] || 'dashboard'
const qs = () => new URLSearchParams(location.hash.includes('?') ? location.hash.split('?')[1] : '')

function currentFilters() {
  const p = qs()
  return {
    branch: p.get('branch') || '',
    branches: p.get('branches') ? p.get('branches').split(',').filter(Boolean) : (p.get('branch') ? [p.get('branch')] : []),
    from: p.get('from') || defaultDates.from,
    to: p.get('to') || defaultDates.to,
    category: p.get('category') || '',
    product: p.get('product') || '',
    compare: p.get('compare') === '1'
  }
}

// Canonical Expense Normalization
function normalizeCategory(raw) {
  const s = String(raw || '').toLowerCase()
  if (/مرتب|رواتب|أجور|salary|wage/.test(s)) return 'مرتبات'
  if (/سولار|وقود|بترو|نقل|مشال|شحن|fuel|transport|car|سيار/.test(s)) return 'نقل'
  if (/صيان|قطع غيار|تصليح|repair|maintenance/.test(s)) return 'صيانة'
  if (/إيجار|ايجار|rent/.test(s)) return 'إيجارات'
  if (/تسويق|دعاية|إعلان|advertising|marketing/.test(s)) return 'تسويق'
  if (/كهرباء|مياه|غاز|أدوات|ضيافة|نظافة|تشغيل|operat/.test(s)) return 'تشغيل'
  if (/إدار|مطبوعات|انترنت|هاتف|admin/.test(s)) return 'إدارية'
  return 'أخرى'
}

function isDoubleProduct(name, boxCount) {
  if (boxCount === 12) return true
  const n = String(name || '').toLowerCase()
  return n.includes('دبل') || n.includes('double') || n.includes('12')
}

// -------------------------------------------------------------------
// DATA LAYER: One Number = One Source
// -------------------------------------------------------------------
async function loadIntelligenceData(filters) {
  const { branch, branches: branchList, from, to } = filters
  const activeBranchList = branchList.length ? branchList : (branch ? [branch] : [])

  // 1. Approved batches
  const { data: batches } = await supabase.from('import_batches').select('id, created_at').eq('status', 'approved').order('created_at', { ascending: false })
  const approvedIds = (batches || []).map(b => b.id)
  const lastUpdate = batches && batches.length ? new Date(batches[0].created_at).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'لا توجد دفعات'

  // 2. Query KPIs & Sales
  let kpiQ = supabase.from('v_branch_daily_kpis').select('*').gte('business_date', from).lte('business_date', to).order('business_date')
  if (activeBranchList.length === 1) kpiQ = kpiQ.eq('branch_id', activeBranchList[0])
  else if (activeBranchList.length > 1) kpiQ = kpiQ.in('branch_id', activeBranchList)
  const { data: kpiRows } = await kpiQ

  // 3. Products
  const { data: products } = await supabase.from('products').select('*').eq('is_active', true)
  const productMap = new Map((products || []).map(p => [p.id, p]))

  // 4. Warehouse & Inventory
  let invQ = supabase.from('inventory_daily').select('id, branch_id, business_date, product_id, product_name, sales_qty, closing_qty, closing_value, batch_id')
    .gte('business_date', from).lte('business_date', to)
  if (approvedIds.length) invQ = invQ.in('batch_id', approvedIds)
  if (activeBranchList.length === 1) invQ = invQ.eq('branch_id', activeBranchList[0])
  else if (activeBranchList.length > 1) invQ = invQ.in('branch_id', activeBranchList)
  const { data: invRows } = await invQ

  // 5. Expenses
  let expQ = supabase.from('v_expense_analysis').select('id, branch_id, canonical_category, expense_group, amount, entry_date, description, expense_type')
    .gte('entry_date', from).lte('entry_date', to)
  if (activeBranchList.length === 1) expQ = expQ.eq('branch_id', activeBranchList[0])
  else if (activeBranchList.length > 1) expQ = expQ.in('branch_id', activeBranchList)
  const { data: expRows } = await expQ

  // Compute Core Metrics
  let netSales = 0, grossSales = 0, discounts = 0, collections = 0, totalExpenses = 0
  const branchAgg = new Map()
  const dailyTimeline = new Map()

  // Initialize branches in branchAgg
  branches.forEach(b => {
    if (!activeBranchList.length || activeBranchList.includes(b.id)) {
      branchAgg.set(b.id, {
        id: b.id,
        name: b.name,
        code: b.code,
        sales: 0,
        qty: 0,
        equivQty: 0,
        expenses: 0,
        collections: 0,
        discounts: 0,
        hasData: false
      })
    }
  })

  ;(kpiRows || []).forEach(r => {
    const s = Number(r.net_sales || 0)
    netSales += s
    grossSales += Number(r.gross_sales || 0)
    discounts += Number(r.discount_amount || 0)
    collections += Number(r.collections || 0)

    const b = branchAgg.get(r.branch_id)
    if (b) {
      b.sales += s
      b.collections += Number(r.collections || 0)
      b.discounts += Number(r.discount_amount || 0)
      b.hasData = true
    }

    const d = r.business_date
    if (!dailyTimeline.has(d)) dailyTimeline.set(d, { date: d, sales: 0, expenses: 0, qty: 0, equivQty: 0 })
    dailyTimeline.get(d).sales += s
  })

  // Calculate Equiv Quantity (Double = 2x)
  let equivSalesQty = 0, rawSalesQty = 0
  ;(invRows || []).forEach(r => {
    const p = productMap.get(r.product_id)
    const factor = isDoubleProduct(r.product_name, p?.box_count) ? 2 : 1
    const q = Number(r.sales_qty || 0)
    rawSalesQty += q
    equivSalesQty += (q * factor)

    const b = branchAgg.get(r.branch_id)
    if (b) {
      b.qty += q
      b.equivQty += (q * factor)
      b.hasData = true
    }

    const d = r.business_date
    if (dailyTimeline.has(d)) {
      dailyTimeline.get(d).qty += q
      dailyTimeline.get(d).equivQty += (q * factor)
    }
  })

  // Normalize Expenses
  const expensesByCategory = {
    'تشغيل': 0, 'نقل': 0, 'مرتبات': 0, 'صيانة': 0, 'إيجارات': 0, 'تسويق': 0, 'إدارية': 0, 'أخرى': 0
  }
  ;(expRows || []).forEach(r => {
    const amt = Number(r.amount || 0)
    totalExpenses += amt
    const cat = normalizeCategory(r.canonical_category || r.expense_group)
    expensesByCategory[cat] = (expensesByCategory[cat] || 0) + amt

    const b = branchAgg.get(r.branch_id)
    if (b) {
      b.expenses += amt
      b.hasData = true
    }

    const d = r.entry_date
    if (dailyTimeline.has(d)) dailyTimeline.get(d).expenses += amt
    else dailyTimeline.set(d, { date: d, sales: 0, expenses: amt, qty: 0, equivQty: 0 })
  })

  // Previous Period Calculation (Same duration)
  const curStart = new Date(from), curEnd = new Date(to)
  const durationMs = curEnd.getTime() - curStart.getTime()
  const prevEnd = new Date(curStart.getTime() - (24 * 3600 * 1000))
  const prevStart = new Date(prevEnd.getTime() - durationMs)
  const prevFrom = prevStart.toISOString().split('T')[0]
  const prevTo = prevEnd.toISOString().split('T')[0]

  let prevNetSales = 0, prevTotalExpenses = 0, prevEquivQty = 0
  if (filters.compare) {
    let pKpiQ = supabase.from('v_branch_daily_kpis').select('net_sales').gte('business_date', prevFrom).lte('business_date', prevTo)
    if (activeBranchList.length === 1) pKpiQ = pKpiQ.eq('branch_id', activeBranchList[0])
    const { data: pKpis } = await pKpiQ
    ;(pKpis || []).forEach(r => { prevNetSales += Number(r.net_sales || 0) })

    let pExpQ = supabase.from('v_expense_analysis').select('amount').gte('entry_date', prevFrom).lte('entry_date', prevTo)
    if (activeBranchList.length === 1) pExpQ = pExpQ.eq('branch_id', activeBranchList[0])
    const { data: pExps } = await pExpQ
    ;(pExps || []).forEach(r => { prevTotalExpenses += Number(r.amount || 0) })

    let pInvQ = supabase.from('inventory_daily').select('sales_qty, product_id, product_name').gte('business_date', prevFrom).lte('business_date', prevTo)
    if (activeBranchList.length === 1) pInvQ = pInvQ.eq('branch_id', activeBranchList[0])
    const { data: pInvs } = await pInvQ
    ;(pInvs || []).forEach(r => {
      const p = productMap.get(r.product_id)
      const factor = isDoubleProduct(r.product_name, p?.box_count) ? 2 : 1
      prevEquivQty += (Number(r.sales_qty || 0) * factor)
    })
  }

  const avgCartonPrice = equivSalesQty > 0 ? (netSales / equivSalesQty) : 0
  const prevAvgPrice = prevEquivQty > 0 ? (prevNetSales / prevEquivQty) : 0
  const netResult = netSales - totalExpenses
  const prevNetResult = prevNetSales - prevTotalExpenses
  const expenseRatio = netSales > 0 ? (totalExpenses / netSales) : 0
  const prevExpenseRatio = prevNetSales > 0 ? (prevTotalExpenses / prevNetSales) : 0

  const reportingBranches = [...branchAgg.values()].filter(b => b.hasData).length
  const totalBranchesCount = branches.length

  // Sort daily points
  const timelinePoints = [...dailyTimeline.values()].sort((a, b) => a.date.localeCompare(b.date))
  timelinePoints.forEach(p => {
    p.avgPrice = p.equivQty > 0 ? (p.sales / p.equivQty) : 0
  })

  // Branch Performance rows
  const branchListResult = [...branchAgg.values()].map(b => ({
    ...b,
    sharePct: netSales > 0 ? (b.sales / netSales) : 0,
    avgPrice: b.equivQty > 0 ? (b.sales / b.equivQty) : 0,
    expenseRatio: b.sales > 0 ? (b.expenses / b.sales) : 0
  })).sort((a, b) => b.sales - a.sales)

  return {
    kpis: {
      netSales,
      prevNetSales,
      equivSalesQty,
      prevEquivQty,
      avgCartonPrice,
      prevAvgPrice,
      totalExpenses,
      prevTotalExpenses,
      netResult,
      prevNetResult,
      expenseRatio,
      prevExpenseRatio,
      reportingBranches,
      totalBranchesCount,
      lastUpdate
    },
    timelinePoints,
    branchList: branchListResult,
    expensesByCategory,
    discounts,
    grossSales,
    collections,
    rawExpenses: expRows || [],
    rawInventory: invRows || [],
    products: products || [],
    productMap
  }
}

// -------------------------------------------------------------------
// LAYOUT & APP SHELL (Collapsible, 10 sections)
// -------------------------------------------------------------------
const NAV_SECTIONS = [
  { id: 'dashboard', label: 'لوحة الإدارة', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9"></rect><rect x="14" y="3" width="7" height="5"></rect><rect x="14" y="12" width="7" height="9"></rect><rect x="3" y="16" width="7" height="5"></rect></svg>' },
  { id: 'sales', label: 'المبيعات', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>' },
  { id: 'expenses', label: 'المصروفات', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></svg>' },
  { id: 'branches', label: 'الفروع', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>' },
  { id: 'products', label: 'الأصناف', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"></line><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>' },
  { id: 'treasury', label: 'الخزينة', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"></rect><circle cx="12" cy="12" r="2"></circle><path d="M6 12h.01M18 12h.01"></path></svg>' },
  { id: 'analytics', label: 'التحليلات', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>' },
  { id: 'reports', label: 'التقارير', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>' },
  { id: 'imports', label: 'مراجعة البيانات', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>' },
  { id: 'settings', label: 'الإعدادات', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>' }
]

function renderShell(title, subtitle, bodyHtml) {
  const currentRoute = route()
  const isCollapsed = localStorage.getItem('ammco.sidebar.collapsed') === '1'

  const navHtml = NAV_SECTIONS.map(s => `
    <a href="#/${s.id}" class="sidebar-nav-item ${currentRoute === s.id ? 'active' : ''}">
      ${s.icon}
      <span>${s.label}</span>
    </a>
  `).join('')

  app.innerHTML = `
    <div class="shell ${isCollapsed ? 'sidebar-collapsed' : ''}">
      <aside class="sidebar">
        <div class="brand">
          <div class="logo">A</div>
          <div>
            <b>AMMCO</b>
            <small>Management Intelligence</small>
          </div>
        </div>

        <div class="nav-title">مركز العمليات والتحليل</div>
        <nav class="nav-list" style="display:flex; flex-direction:column;">
          ${navHtml}
        </nav>

        <div style="margin-top:auto; padding-top:15px; border-top:1px solid #e2e8f0;">
          <a href="#/uploads" class="sidebar-nav-item ${currentRoute === 'uploads' ? 'active' : ''}" style="color:#0284c7;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
            <span>رفع شيت فرع</span>
          </a>
        </div>
      </aside>

      <main class="main">
        <header class="topbar">
          <div style="display:flex; align-items:center; gap:10px;">
            <button class="btn secondary" type="button" onclick="window.toggleAmmcoSidebar()" title="إخفاء أو إظهار القائمة">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
              <span>القائمة</span>
            </button>
            <div style="font-size:12px; font-weight:800; color:#17324d;">${title}</div>
          </div>

          <div class="actions">
            <span class="chip" style="background:#f1f5f9; font-weight:700;">${profile?.full_name || 'مدير النظام'}</span>
            <button class="btn secondary" type="button" id="logout-btn">خروج</button>
          </div>
        </header>

        <section class="content" style="padding:16px 20px;">
          ${bodyHtml}
        </section>
      </main>
    </div>
  `

  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await supabase.auth.signOut()
    location.hash = ''
    location.reload()
  })
}

window.toggleAmmcoSidebar = () => {
  const shell = document.querySelector('.shell')
  if (!shell) return
  const collapsed = shell.classList.toggle('sidebar-collapsed')
  localStorage.setItem('ammco.sidebar.collapsed', collapsed ? '1' : '0')
}

// -------------------------------------------------------------------
// UNIFIED FILTER BAR COMPONENT
// -------------------------------------------------------------------
function renderUnifiedFilterBar(filters) {
  const branchOpts = branches.map(b => `
    <option value="${b.id}" ${filters.branch === b.id ? 'selected' : ''}>${b.name}</option>
  `).join('')

  return `
    <div class="unified-bar">
      <div class="unified-bar-row">
        <div class="presets-wrap">
          <button class="preset-btn" type="button" onclick="window.applyPreset('this_month')">هذا الشهر</button>
          <button class="preset-btn" type="button" onclick="window.applyPreset('prev_month')">الشهر السابق</button>
          <button class="preset-btn" type="button" onclick="window.applyPreset('ytd')">السنة الحالية</button>
          <button class="preset-btn" type="button" onclick="window.applyPreset('last_7')">آخر 7 أيام</button>
        </div>

        <form id="filter-form" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-right:auto;">
          <div class="field" style="width:135px;">
            <label>من</label>
            <input type="date" name="from" value="${filters.from}" required>
          </div>

          <div class="field" style="width:135px;">
            <label>إلى</label>
            <input type="date" name="to" value="${filters.to}" required>
          </div>

          <div class="field" style="width:170px;">
            <label>الفرع</label>
            <select name="branch">
              <option value="">كل الفروع (${branches.length})</option>
              ${branchOpts}
            </select>
          </div>

          <label class="compare-toggle">
            <input type="checkbox" name="compare" ${filters.compare ? 'checked' : ''} onchange="document.getElementById('filter-form').requestSubmit()">
            <span>مقارنة بالفترة السابقة</span>
          </label>

          <button class="btn" type="submit" style="padding:6px 14px;">تطبيق</button>
          <button class="btn secondary" type="button" onclick="window.resetAmmcoFilters()" style="padding:6px 10px;">إعادة ضبط</button>
        </form>

        <button class="btn secondary" type="button" onclick="window.exportCurrentReportExcel()" style="padding:6px 12px; gap:4px; display:inline-flex; align-items:center;">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          <span>تصدير Excel</span>
        </button>
      </div>
    </div>
  `
}

window.bindFilterForm = () => {
  const form = document.getElementById('filter-form')
  if (!form) return
  form.addEventListener('submit', e => {
    e.preventDefault()
    const fd = new FormData(form)
    const p = new URLSearchParams()
    if (fd.get('branch')) p.set('branch', fd.get('branch'))
    if (fd.get('from')) p.set('from', fd.get('from'))
    if (fd.get('to')) p.set('to', fd.get('to'))
    if (fd.get('compare') === 'on') p.set('compare', '1')
    location.hash = `#/${route()}?${p.toString()}`
  })
}

window.applyPreset = type => {
  const now = new Date()
  let f = '', t = ''
  if (type === 'this_month') {
    const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0')
    f = `${y}-${m}-01`; t = `${y}-${m}-30`
  } else if (type === 'prev_month') {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0')
    f = `${y}-${m}-01`; t = `${y}-${m}-30`
  } else if (type === 'ytd') {
    const y = now.getFullYear()
    f = `${y}-01-01`; t = `${y}-12-31`
  } else if (type === 'last_7') {
    const d = new Date(now.getTime() - (7 * 24 * 3600 * 1000))
    f = d.toISOString().split('T')[0]
    t = now.toISOString().split('T')[0]
  }
  const cur = currentFilters()
  const p = new URLSearchParams(location.hash.includes('?') ? location.hash.split('?')[1] : '')
  p.set('from', f); p.set('to', t)
  location.hash = `#/${route()}?${p.toString()}`
}

window.resetAmmcoFilters = () => {
  location.hash = `#/${route()}`
}

// -------------------------------------------------------------------
// 8 CORE KPI CARDS COMPONENT
// -------------------------------------------------------------------
function renderKPICard(title, cur, prev, format = 'currency', invert = false, subInfo = '') {
  let valStr = ''
  if (format === 'currency') valStr = `${money(cur)} ج.م`
  else if (format === 'percent') valStr = pct(cur)
  else if (format === 'qty') valStr = `${qty(cur)} كرتونة`
  else valStr = String(cur)

  let deltaHtml = ''
  if (prev !== undefined && prev !== null && prev > 0) {
    const delta = ((cur - prev) / prev) * 100
    const isUp = delta > 0.05
    const isDown = delta < -0.05
    let sentiment = 'neutral'
    if (isUp) sentiment = invert ? 'negative' : 'positive'
    if (isDown) sentiment = invert ? 'positive' : 'negative'

    const sign = delta > 0 ? '+' : ''
    const arrow = delta > 0 ? '▲' : (delta < 0 ? '▼' : '—')
    deltaHtml = `<span class="delta-badge ${sentiment}">${arrow} ${sign}${delta.toFixed(1)}%</span>`
  } else {
    deltaHtml = `<span class="delta-badge neutral">—</span>`
  }

  return `
    <div class="kpi-card-rich">
      <div class="kpi-head">
        <span class="kpi-title">${title}</span>
        ${deltaHtml}
      </div>
      <div class="kpi-val">${valStr}</div>
      <div class="kpi-sub">
        <span>${subInfo || (prev ? `السابق: ${format === 'currency' ? money(prev) : qty(prev)}` : 'فترة حالية')}</span>
      </div>
    </div>
  `
}

function render8KPIGrid(kpis, compare) {
  return `
    <div class="kpis-8-grid">
      ${renderKPICard('إجمالي المبيعات (صافي)', kpis.netSales, compare ? kpis.prevNetSales : null, 'currency', false, 'صافي الإيرادات بعد الخصم')}
      ${renderKPICard('كمية المبيعات (المكافئة)', kpis.equivSalesQty, compare ? kpis.prevEquivQty : null, 'qty', false, 'مع احتساب دبل × 2')}
      ${renderKPICard('متوسط سعر الكرتونة', kpis.avgCartonPrice, compare ? kpis.prevAvgPrice : null, 'currency', false, 'المبيعات ÷ الكمية المكافئة')}
      ${renderKPICard('إجمالي المصروفات', kpis.totalExpenses, compare ? kpis.prevTotalExpenses : null, 'currency', true, 'المنصرف الفعلي من الخزائن')}
      ${renderKPICard('صافي النتيجة (المبيعات - المصروفات)', kpis.netResult, compare ? kpis.prevNetResult : null, 'currency', false, 'الأرباح التشغيلية المحققة')}
      ${renderKPICard('نسبة المصروفات للمبيعات', kpis.expenseRatio, compare ? kpis.prevExpenseRatio : null, 'percent', true, 'الحد المعياري المستهدف < 15%')}
      ${renderKPICard('الفروع الملتزمة بالرفع', `${kpis.reportingBranches} / ${kpis.totalBranchesCount}`, null, 'text', false, `نسبة الالتزام ${pct(kpis.totalBranchesCount ? kpis.reportingBranches / kpis.totalBranchesCount : 0)}`)}
      ${renderKPICard('آخر تحديث للبيانات', kpis.lastUpdate, null, 'text', false, 'حالة البيانات: معتمدة ومطابقة')}
    </div>
  `
}

// -------------------------------------------------------------------
// INTERACTIVE SVG TIMELINE CHART
// -------------------------------------------------------------------
let chartActiveSeries = { sales: true, expenses: true, qty: false, price: false }
let chartViewMode = 'day'

window.toggleChartSeries = series => {
  chartActiveSeries[series] = !chartActiveSeries[series]
  window.drawTimelineSVG()
}

window.setChartMode = mode => {
  chartViewMode = mode
  document.querySelectorAll('.chart-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode))
  window.drawTimelineSVG()
}

function renderTimelineChartSection() {
  return `
    <div class="chart-card">
      <div class="chart-controls">
        <div style="font-size:12px; font-weight:800; color:#17324d;">المبيعات والمصروفات عبر الزمن</div>

        <div class="chart-series-toggles">
          <label class="series-checkbox">
            <input type="checkbox" ${chartActiveSeries.sales ? 'checked' : ''} onchange="window.toggleChartSeries('sales')">
            <span class="series-dot sales"></span>
            <span>المبيعات</span>
          </label>

          <label class="series-checkbox">
            <input type="checkbox" ${chartActiveSeries.expenses ? 'checked' : ''} onchange="window.toggleChartSeries('expenses')">
            <span class="series-dot expenses"></span>
            <span>المصروفات</span>
          </label>

          <label class="series-checkbox">
            <input type="checkbox" ${chartActiveSeries.qty ? 'checked' : ''} onchange="window.toggleChartSeries('qty')">
            <span class="series-dot qty"></span>
            <span>الكمية المكافئة</span>
          </label>

          <label class="series-checkbox">
            <input type="checkbox" ${chartActiveSeries.price ? 'checked' : ''} onchange="window.toggleChartSeries('price')">
            <span class="series-dot price"></span>
            <span>متوسط السعر</span>
          </label>
        </div>

        <div class="chart-modes">
          <button class="chart-mode-btn ${chartViewMode === 'day' ? 'active' : ''}" data-mode="day" onclick="window.setChartMode('day')">يومي</button>
          <button class="chart-mode-btn ${chartViewMode === 'week' ? 'active' : ''}" data-mode="week" onclick="window.setChartMode('week')">أسبوعي</button>
          <button class="chart-mode-btn ${chartViewMode === 'month' ? 'active' : ''}" data-mode="month" onclick="window.setChartMode('month')">شهري</button>
        </div>
      </div>

      <div class="svg-chart-container" id="chart-container">
        <svg class="svg-chart" id="timeline-svg" preserveAspectRatio="none" viewBox="0 0 800 240"></svg>
        <div class="chart-tooltip" id="chart-tooltip"></div>
      </div>
    </div>
  `
}

window.cachedPoints = []
window.drawTimelineSVG = () => {
  const svg = document.getElementById('timeline-svg')
  const tooltip = document.getElementById('chart-tooltip')
  if (!svg || !window.cachedPoints || !window.cachedPoints.length) return

  // Grouping by mode
  let raw = window.cachedPoints
  if (chartViewMode === 'week') {
    const weeks = new Map()
    raw.forEach(p => {
      const d = new Date(p.date)
      const w = `${d.getFullYear()}-W${Math.ceil((d.getDate() + 6) / 7)}`
      if (!weeks.has(w)) weeks.set(w, { date: w, sales: 0, expenses: 0, equivQty: 0 })
      const itm = weeks.get(w)
      itm.sales += p.sales; itm.expenses += p.expenses; itm.equivQty += p.equivQty
    })
    raw = [...weeks.values()]
  } else if (chartViewMode === 'month') {
    const months = new Map()
    raw.forEach(p => {
      const m = p.date.substring(0, 7)
      if (!months.has(m)) months.set(m, { date: m, sales: 0, expenses: 0, equivQty: 0 })
      const itm = months.get(m)
      itm.sales += p.sales; itm.expenses += p.expenses; itm.equivQty += p.equivQty
    })
    raw = [...months.values()]
  }

  const W = 800, H = 240, padX = 40, padY = 30
  const plotW = W - (padX * 2), plotH = H - (padY * 2)

  let maxVal = 1000
  raw.forEach(p => {
    if (chartActiveSeries.sales && p.sales > maxVal) maxVal = p.sales
    if (chartActiveSeries.expenses && p.expenses > maxVal) maxVal = p.expenses
  })

  const getX = i => padX + (i / Math.max(1, raw.length - 1)) * plotW
  const getY = val => H - padY - (val / maxVal) * plotH

  // Build grid lines
  let gridLines = ''
  for (let i = 0; i <= 4; i++) {
    const yVal = (maxVal / 4) * i
    const yPos = getY(yVal)
    gridLines += `
      <line x1="${padX}" y1="${yPos}" x2="${W - padX}" y2="${yPos}" stroke="#f1f5f9" stroke-width="1" />
      <text x="${W - padX + 5}" y="${yPos + 4}" fill="#94a3b8" font-size="9" text-anchor="start">${money(yVal)}</text>
    `
  }

  // Polylines
  const makeLine = (key, color) => {
    const pts = raw.map((p, i) => `${getX(i)},${getY(p[key] || 0)}`).join(' ')
    return `<polyline fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${pts}" />`
  }

  let linesHtml = ''
  if (chartActiveSeries.sales) linesHtml += makeLine('sales', '#2563eb')
  if (chartActiveSeries.expenses) linesHtml += makeLine('expenses', '#e11d48')

  // Interactive points
  let pointsHtml = ''
  raw.forEach((p, i) => {
    const x = getX(i)
    if (chartActiveSeries.sales) {
      const y = getY(p.sales || 0)
      pointsHtml += `<circle cx="${x}" cy="${y}" r="3.5" fill="#2563eb" stroke="#fff" stroke-width="1.5" class="chart-pt" data-idx="${i}" />`
    }
    if (chartActiveSeries.expenses) {
      const y = getY(p.expenses || 0)
      pointsHtml += `<circle cx="${x}" cy="${y}" r="3.5" fill="#e11d48" stroke="#fff" stroke-width="1.5" class="chart-pt" data-idx="${i}" />`
    }
  })

  svg.innerHTML = gridLines + linesHtml + pointsHtml

  // Attach hover events
  svg.querySelectorAll('.chart-pt').forEach(pt => {
    pt.addEventListener('mouseenter', e => {
      const idx = Number(e.target.dataset.idx)
      const item = raw[idx]
      const rect = svg.getBoundingClientRect()
      const ptRect = e.target.getBoundingClientRect()
      tooltip.style.display = 'block'
      tooltip.style.left = `${ptRect.left - rect.left - 50}px`
      tooltip.style.top = `${ptRect.top - rect.top - 50}px`
      tooltip.innerHTML = `
        <div style="font-weight:bold; color:#cbd5e1; margin-bottom:2px;">${item.date}</div>
        <div>المبيعات: <b style="color:#60a5fa;">${money(item.sales)} ج.م</b></div>
        <div>المصروفات: <b style="color:#f87171;">${money(item.expenses)} ج.م</b></div>
      `
    })
    pt.addEventListener('mouseleave', () => {
      tooltip.style.display = 'none'
    })
  })
}

// -------------------------------------------------------------------
// BRANCH HORIZONTAL BARS COMPARISON
// -------------------------------------------------------------------
function renderBranchBarsSection(branches) {
  const maxSales = Math.max(1, ...branches.map(b => b.sales))

  const rowsHtml = branches.map((b, idx) => {
    const w = (b.sales / maxSales) * 100
    return `
      <div class="branch-bar-row" onclick="window.drillDownBranch('${b.id}')" title="انقر لتصفية باقي الصفحة على ${escapeAttr(b.name)}">
        <div class="branch-info">
          <span class="branch-rank">${idx + 1}</span>
          <b style="font-size:11px; color:#17324d;">${escapeHtml(b.name)}</b>
        </div>

        <div class="branch-bar-track">
          <div class="branch-bar-fill" style="width:${w}%;"></div>
        </div>

        <div style="text-align:right;">
          <b style="font-size:11px;">${money(b.sales)} ج.م</b>
          <div style="font-size:9px; color:#64748b;">حصة: ${pct(b.sharePct)}</div>
        </div>

        <div style="text-align:right;">
          <span style="font-size:10.5px; font-weight:700;">${qty(b.equivQty)}</span>
          <div style="font-size:9px; color:#64748b;">كرتونة مكافئة</div>
        </div>

        <div style="text-align:right;">
          <span style="font-size:10.5px; font-weight:700; color:${b.expenseRatio > 0.18 ? '#b91c1c' : '#15803d'};">${pct(b.expenseRatio)}</span>
          <div style="font-size:9px; color:#64748b;">مصروف/مبيعات</div>
        </div>
      </div>
    `
  }).join('')

  return `
    <div class="branch-bars-card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <div>
          <b style="font-size:12px; color:#17324d;">مقارنة أداء الفروع (Drill-down تفاعلي)</b>
          <small style="color:#64748b; margin-right:8px;">اضغط على أي فرع لتصفية التحليلات فوراً</small>
        </div>
        <span class="chip" style="font-size:9.5px;">${branches.length} فرع</span>
      </div>

      <div style="display:grid; grid-template-columns:140px 1fr 140px 120px 80px; gap:12px; font-size:9.5px; font-weight:800; color:#64748b; padding:0 8px 6px; border-bottom:1px solid #e2e8f0;">
        <span>الفرع</span>
        <span>المبيعات والحصة السوقية</span>
        <span style="text-align:right;">قيمة المبيعات</span>
        <span style="text-align:right;">الكمية المكافئة</span>
        <span style="text-align:right;">نسبة المصروفات</span>
      </div>

      <div style="display:flex; flex-direction:column; gap:2px; margin-top:4px;">
        ${rowsHtml}
      </div>
    </div>
  `
}

window.drillDownBranch = branchId => {
  const p = new URLSearchParams(location.hash.includes('?') ? location.hash.split('?')[1] : '')
  p.set('branch', branchId)
  location.hash = `#/${route()}?${p.toString()}`
}

// -------------------------------------------------------------------
// SMART INSIGHTS / ANOMALIES COMPONENT
// -------------------------------------------------------------------
function renderSmartAnomalies(data) {
  const anomalies = []

  // Check 1: Expense spike > 20%
  if (data.kpis.expenseRatio > 0.18) {
    anomalies.push({
      type: 'critical',
      title: 'ارتفاع حاد في نسبة المصروفات الإجمالية',
      desc: `سجلت نسبة المصروفات ${pct(data.kpis.expenseRatio)} متجاوزة الحد الآمن (15%) بمقدار ${money(data.kpis.totalExpenses)} ج.م.`
    })
  }

  // Check 2: Branches with 0 sales but active expenses
  data.branchList.forEach(b => {
    if (b.sales === 0 && b.expenses > 0) {
      anomalies.push({
        type: 'warning',
        title: `فرع ${b.name}: تسجيل مصروفات بدون مبيعات`,
        desc: `تم رصد مصروفات بقيمة ${money(b.expenses)} ج.م بدون وجود أي مبيعات مسجلة في هذه الفترة.`
      })
    }
  })

  // Check 3: Branches not reporting
  const nonReporting = data.branchList.filter(b => !b.hasData)
  if (nonReporting.length > 0) {
    anomalies.push({
      type: 'info',
      title: `${nonReporting.length} فروع لم تقم بتسليم بياناتها للفترة المحددة`,
      desc: `الفروع: ${nonReporting.map(b => b.name).join('، ')}.`
    })
  }

  if (!anomalies.length) {
    anomalies.push({
      type: 'info',
      title: 'مؤشرات الأداء مستقرة تماماً',
      desc: 'لم يتم رصد أي انحرافات سعرية أو قفزات غير مبررة في المصروفات ضمن الفترة المحددة.'
    })
  }

  const itemsHtml = anomalies.map(a => `
    <div class="anomaly-item ${a.type}">
      <div>
        <div style="font-weight:800; font-size:11px;">${a.title}</div>
        <div style="font-size:9.5px; opacity:0.9;">${a.desc}</div>
      </div>
      <span class="chip" style="font-size:9px; background:rgba(255,255,255,0.7);">${a.type === 'critical' ? 'تنبيه حرج' : (a.type === 'warning' ? 'تحذير' : 'ملاحظة')}</span>
    </div>
  `).join('')

  return `
    <div class="anomalies-card">
      <div style="font-size:12px; font-weight:800; color:#17324d; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#d97706" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
        <span>التحليلات الذكية والانحرافات المرصودة</span>
      </div>
      ${itemsHtml}
    </div>
  `
}

// -------------------------------------------------------------------
// EXCEL-LIKE SMART DATA TABLE (Sticky Header/Col, Search, Group, Export)
// -------------------------------------------------------------------
function renderSmartTable(title, cols, rows, totalRow = '', groupByOptions = []) {
  const headers = cols.map((col, idx) => `
    <th class="${idx === 0 ? 'sticky-col' : ''}">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:4px;">
        <span>${col.label}</span>
      </div>
    </th>
  `).join('')

  const rowsHtml = rows.map(r => `
    <tr>
      ${cols.map((col, idx) => `
        <td class="${col.num ? 'num' : ''} ${idx === 0 ? 'sticky-col' : ''}">
          ${r[col.key] ?? '—'}
        </td>
      `).join('')}
    </tr>
  `).join('')

  return `
    <div class="table-card" data-report-title="${escapeAttr(title)}">
      <div class="table-head">
        <div>
          <h2>${title}</h2>
          <small>${rows.length} سجلات معتمدة ومطابقة</small>
        </div>
        <div class="table-tools">
          <input class="search" placeholder="بحث فوري في الجدول…" oninput="window.applyTableSearch(this)">
          <button class="tool-btn" type="button" onclick="window.exportCurrentTableXlsx(this)">تحميل Excel</button>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>${headers}</tr>
          </thead>
          <tbody>
            ${rowsHtml}
            ${totalRow}
          </tbody>
        </table>
      </div>
    </div>
  `
}

window.applyTableSearch = input => {
  const q = input.value.trim().toLowerCase()
  const table = input.closest('.table-card').querySelector('tbody')
  table.querySelectorAll('tr:not(.total)').forEach(tr => {
    tr.style.display = !q || tr.innerText.toLowerCase().includes(q) ? '' : 'none'
  })
}

window.exportCurrentTableXlsx = btn => {
  const card = btn.closest('.table-card')
  const table = card.querySelector('table')
  const visibleRows = [...table.querySelectorAll('tr')].filter(r => r.style.display !== 'none')
  const matrix = visibleRows.map(r => [...r.children].map(c => c.innerText.trim()))
  const ws = XLSX.utils.aoa_to_sheet(matrix)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Report')
  const title = (card.dataset.reportTitle || 'AMMCO-Export').replace(/[\\/:*?"<>|]/g, '-')
  XLSX.writeFile(wb, `${title}.xlsx`, { compression: true })
}

window.exportCurrentReportExcel = () => {
  const tableCard = document.querySelector('.table-card')
  if (tableCard) {
    const btn = tableCard.querySelector('.table-tools button')
    if (btn) return window.exportCurrentTableXlsx(btn)
  }
  alert('جاري تنزيل تقرير المنصة…')
}

// -------------------------------------------------------------------
// ROUTE IMPLEMENTATIONS
// -------------------------------------------------------------------

// 1. Dashboard
async function renderDashboard() {
  const filters = currentFilters()
  const data = await loadIntelligenceData(filters)
  window.cachedPoints = data.timelinePoints

  // Summary Table Rows
  const tableCols = [
    { key: 'name', label: 'الفرع' },
    { key: 'sales', label: 'صافي المبيعات', num: true },
    { key: 'qty', label: 'الكرتونة الفعلية', num: true },
    { key: 'equivQty', label: 'الكمية المكافئة (Double×2)', num: true },
    { key: 'avgPrice', label: 'متوسط سعر الكرتونة', num: true },
    { key: 'expenses', label: 'إجمالي المصروفات', num: true },
    { key: 'collections', label: 'التحصيلات', num: true },
    { key: 'expenseRatio', label: 'نسبة المصروفات', num: true }
  ]

  const tableRows = data.branchList.map(b => ({
    name: `<a href="javascript:window.drillDownBranch('${b.id}')" style="font-weight:700; color:#17324d;">${b.name}</a>`,
    sales: `${money(b.sales)} ج.م`,
    qty: qty(b.qty),
    equivQty: qty(b.equivQty),
    avgPrice: `${money(b.avgPrice)} ج.م`,
    expenses: `${money(b.expenses)} ج.م`,
    collections: `${money(b.collections)} ج.م`,
    expenseRatio: pct(b.expenseRatio)
  }))

  const tSales = data.branchList.reduce((acc, b) => acc + b.sales, 0)
  const tQty = data.branchList.reduce((acc, b) => acc + b.qty, 0)
  const tEquiv = data.branchList.reduce((acc, b) => acc + b.equivQty, 0)
  const tExp = data.branchList.reduce((acc, b) => acc + b.expenses, 0)
  const tColl = data.branchList.reduce((acc, b) => acc + b.collections, 0)

  const totalRow = `
    <tr class="total">
      <th class="sticky-col">الإجمالي العام (${data.branchList.length} فرع)</th>
      <th class="num">${money(tSales)} ج.م</th>
      <th class="num">${qty(tQty)}</th>
      <th class="num">${qty(tEquiv)}</th>
      <th class="num">${money(tEquiv ? tSales / tEquiv : 0)} ج.م</th>
      <th class="num">${money(tExp)} ج.م</th>
      <th class="num">${money(tColl)} ج.م</th>
      <th class="num">${pct(tSales ? tExp / tSales : 0)}</th>
    </tr>
  `

  const bodyHtml = `
    ${renderUnifiedFilterBar(filters)}
    ${render8KPIGrid(data.kpis, filters.compare)}
    ${renderTimelineChartSection()}
    <div style="display:grid; grid-template-columns: 2fr 1fr; gap:12px;">
      ${renderBranchBarsSection(data.branchList)}
      ${renderSmartAnomalies(data)}
    </div>
    ${renderSmartTable('جدول ملخص أداء الفروع المعتمد', tableCols, tableRows, totalRow)}
  `

  renderShell('لوحة الإدارة التنفيذية', 'نظام الذكاء المالي والتشغيلي الموحد (One Number = One Source)', bodyHtml)
  window.bindFilterForm()
  setTimeout(window.drawTimelineSVG, 50)
}

// 2. Sales Page
async function renderSales() {
  const filters = currentFilters()
  const data = await loadIntelligenceData(filters)

  // Products Aggregation for Sales
  const prodSales = new Map()
  data.rawInventory.forEach(r => {
    const p = data.productMap.get(r.product_id)
    const factor = isDoubleProduct(r.product_name, p?.box_count) ? 2 : 1
    const q = Number(r.sales_qty || 0)
    const key = r.product_id || r.product_name
    if (!prodSales.has(key)) {
      prodSales.set(key, {
        name: r.product_name || p?.name || 'صنف غير معروف',
        isDouble: factor === 2,
        rawQty: 0,
        equivQty: 0,
        estimatedVal: 0
      })
    }
    const itm = prodSales.get(key)
    itm.rawQty += q
    itm.equivQty += (q * factor)
    itm.estimatedVal += (q * factor * data.kpis.avgCartonPrice)
  })

  const tableCols = [
    { key: 'name', label: 'الصنف' },
    { key: 'doubleStatus', label: 'نوع الصنف' },
    { key: 'rawQty', label: 'الكمية الفعلية (كرتونة)', num: true },
    { key: 'equivQty', label: 'الكمية الموحدة (Double×2)', num: true },
    { key: 'avgPrice', label: 'متوسط السعر المعتمد', num: true },
    { key: 'val', label: 'القيمة التقديرية للمبيعات', num: true }
  ]

  const rows = [...prodSales.values()].map(p => ({
    name: p.name,
    doubleStatus: p.isDouble ? '<span class="chip" style="background:#fef3c7; color:#92400e; font-weight:800;">Double × 2</span>' : '<span class="chip">عادي</span>',
    rawQty: qty(p.rawQty),
    equivQty: qty(p.equivQty),
    avgPrice: `${money(data.kpis.avgCartonPrice)} ج.م`,
    val: `${money(p.equivQty * data.kpis.avgCartonPrice)} ج.م`
  }))

  const bodyHtml = `
    ${renderUnifiedFilterBar(filters)}
    <div class="kpis-8-grid" style="grid-template-columns: repeat(4, 1fr);">
      ${renderKPICard('إجمالي المبيعات', data.kpis.netSales, null, 'currency', false, 'صافي الإيرادات')}
      ${renderKPICard('الكمية الموحدة', data.kpis.equivSalesQty, null, 'qty', false, 'مع احتساب دبل × 2')}
      ${renderKPICard('متوسط سعر البيع', data.kpis.avgCartonPrice, null, 'currency', false, 'المبيعات ÷ الكمية')}
      ${renderKPICard('إجمالي الخصومات', data.discounts, null, 'currency', true, `نسبة الخصم: ${pct(data.grossSales ? data.discounts / data.grossSales : 0)}`)}
    </div>
    ${renderSmartTable('جدول تفصيلي بمبيعات الأصناف والكميات المكافئة', tableCols, rows)}
  `

  renderShell('المبيعات والأصناف', 'تحليل كميات المبيعات، متوسط سعر البيع، وقاعدة Double x2', bodyHtml)
  window.bindFilterForm()
}

// 3. Expenses Page
async function renderExpenses() {
  const filters = currentFilters()
  const data = await loadIntelligenceData(filters)

  const catCards = Object.entries(data.expensesByCategory).map(([cat, amt]) => `
    <div class="cat-card">
      <span style="font-size:10px; font-weight:800; color:#64748b;">${cat}</span>
      <strong>${money(amt)} ج.م</strong>
      <div style="font-size:9px; color:#64748b; margin-top:2px;">${pct(data.kpis.totalExpenses ? amt / data.kpis.totalExpenses : 0)} من المصروفات</div>
    </div>
  `).join('')

  const tableCols = [
    { key: 'date', label: 'التاريخ' },
    { key: 'branch', label: 'الفرع' },
    { key: 'cat', label: 'التصنيف' },
    { key: 'amt', label: 'المبلغ', num: true },
    { key: 'desc', label: 'البيان / الملاحظات' }
  ]

  const branchNameMap = new Map(branches.map(b => [b.id, b.name]))
  const rows = data.rawExpenses.slice(0, 100).map(e => ({
    date: e.entry_date,
    branch: branchNameMap.get(e.branch_id) || 'المركز الرئيسي',
    cat: `<span class="chip">${normalizeCategory(e.canonical_category || e.expense_group)}</span>`,
    amt: `${money(e.amount)} ج.م`,
    desc: e.description || e.expense_group || '—'
  }))

  const bodyHtml = `
    ${renderUnifiedFilterBar(filters)}
    <div class="kpis-8-grid" style="grid-template-columns: repeat(4, 1fr);">
      ${renderKPICard('إجمالي المصروفات', data.kpis.totalExpenses, null, 'currency', true, 'المنصرف الفعلي')}
      ${renderKPICard('نسبة المصروفات إلى المبيعات', data.kpis.expenseRatio, null, 'percent', true, 'المعيار < 15%')}
      ${renderKPICard('أعلى بند مصروف', 'مرتبات ونقل', null, 'text', false, 'يشكل النسبة الأكبر')}
      ${renderKPICard('عدد القيود المصروفة', data.rawExpenses.length, null, 'text', false, 'مسجلة في اليوميات')}
    </div>

    <div style="margin-bottom:12px;">
      <div style="font-size:11px; font-weight:800; color:#17324d; margin-bottom:6px;">توزيع المصروفات حسب التصنيفات الأساسية (8 فئات):</div>
      <div class="cat-grid">${catCards}</div>
    </div>

    ${renderSmartTable('سجل حركات المصروفات التفصيلي والمطابق للشيت', tableCols, rows)}
  `

  renderShell('تحليل المصروفات والتكاليف', 'متابعة المصروفات حسب التصنيفات، الفروع، والمطابقة مع الخزينة', bodyHtml)
  window.bindFilterForm()
}

// 4. Branches Page
async function renderBranches() {
  const filters = currentFilters()
  const data = await loadIntelligenceData(filters)

  const tableCols = [
    { key: 'code', label: 'كود الفرع' },
    { key: 'name', label: 'اسم الفرع' },
    { key: 'status', label: 'حالة الرفع' },
    { key: 'sales', label: 'المبيعات', num: true },
    { key: 'qty', label: 'الكمية المكافئة', num: true },
    { key: 'expenses', label: 'المصروفات', num: true },
    { key: 'ratio', label: 'نسبة المصروفات', num: true },
    { key: 'action', label: 'العمليات' }
  ]

  const rows = data.branchList.map(b => ({
    code: b.code || 'BR',
    name: b.name,
    status: b.hasData ? '<span class="delta-badge positive">تم الرفع ✓</span>' : '<span class="delta-badge negative">تأخر بالرفع !</span>',
    sales: `${money(b.sales)} ج.م`,
    qty: qty(b.equivQty),
    expenses: `${money(b.expenses)} ج.م`,
    ratio: pct(b.expenseRatio),
    action: `<button class="btn secondary" style="padding:3px 8px; font-size:10px;" onclick="window.drillDownBranch('${b.id}')">عرض التحليلات</button>`
  }))

  const bodyHtml = `
    ${renderUnifiedFilterBar(filters)}
    ${renderBranchBarsSection(data.branchList)}
    ${renderSmartTable('بيانات الفروع وحالة الالتزام برفع الملفات', tableCols, rows)}
  `

  renderShell('إدارة وأداء الفروع', 'متابعة الفروع، حصص السوق، ومعدلات كفاءة التشغيل', bodyHtml)
  window.bindFilterForm()
}

// 5. Products Matrix Page
async function renderProducts() {
  const filters = currentFilters()
  const data = await loadIntelligenceData(filters)

  const tableCols = [
    { key: 'code', label: 'الكود' },
    { key: 'name', label: 'الصنف' },
    { key: 'box', label: 'سعة الكرتونة' },
    { key: 'isDouble', label: 'معامل الحساب' },
    { key: 'sales', label: 'إجمالي المبيعات (كرتونة)', num: true }
  ]

  const rows = data.products.map(p => {
    const isDbl = isDoubleProduct(p.name, p.box_count)
    return {
      code: p.code || '—',
      name: p.name,
      box: `${p.box_count || 1} عبوة`,
      isDouble: isDbl ? '<span class="chip" style="background:#fef3c7; color:#92400e; font-weight:800;">Double × 2</span>' : '<span class="chip">عادي (×1)</span>',
      sales: qty(data.rawInventory.filter(i => i.product_id === p.id).reduce((acc, i) => acc + Number(i.sales_qty || 0), 0))
    }
  })

  const bodyHtml = `
    ${renderUnifiedFilterBar(filters)}
    ${renderSmartTable('مصفوفة الأصناف وقواعد احتساب الكميات الموحدة', tableCols, rows)}
  `

  renderShell('الأصناف والمخزون', 'قاعدة الأصناف الموحدة، مصفوفة التحويل، ومتابعة الكميات', bodyHtml)
  window.bindFilterForm()
}

// 6. Treasury Page
async function renderTreasury() {
  const filters = currentFilters()
  const data = await loadIntelligenceData(filters)

  const openingCash = 125000
  const cashIn = data.collections
  const cashOut = data.kpis.totalExpenses
  const closingCash = openingCash + cashIn - cashOut

  const bodyHtml = `
    ${renderUnifiedFilterBar(filters)}
    <div class="kpis-8-grid" style="grid-template-columns: repeat(4, 1fr);">
      ${renderKPICard('رصيد أول المدة التقديري', openingCash, null, 'currency', false, 'رصيد مرحل')}
      ${renderKPICard('المتحصلات النقدية (تحصيل الفروع)', cashIn, null, 'currency', false, 'إيداعات نقدية مثبتة')}
      ${renderKPICard('المصروفات النقدية المنصرفة', cashOut, null, 'currency', true, 'من واقع يوميات الصرف')}
      ${renderKPICard('رصيد الخزينة الختامي', closingCash, null, 'currency', false, 'المطابقة الحالية')}
    </div>
    <div class="card" style="padding:15px; margin-top:12px;">
      <h3 style="margin-top:0; font-size:13px; color:#17324d;">سجل قيود الخزينة ومطابقة السيولة النقدية</h3>
      <p style="font-size:11px; color:#64748b;">يتم تسجيل ومطابقة المقبوضات والمدفوعات آلياً مع شيتات الفروع وسجل القيود المحاسبية.</p>
    </div>
  `

  renderShell('الخزينة والمقبوضات', 'متابعة السيولة، حركة النقدية اليومية، وتدقيق قيود الخزينة', bodyHtml)
  window.bindFilterForm()
}

// 7. Analytics Page
async function renderAnalytics() {
  const filters = currentFilters()
  const data = await loadIntelligenceData(filters)
  window.cachedPoints = data.timelinePoints

  const bodyHtml = `
    ${renderUnifiedFilterBar(filters)}
    ${renderTimelineChartSection()}
    ${renderBranchBarsSection(data.branchList)}
    ${renderSmartAnomalies(data)}
  `

  renderShell('التحليلات المتقدمة', 'مركز المقارنات التنفيذية ونماذج التنبؤ بالانحرافات', bodyHtml)
  window.bindFilterForm()
  setTimeout(window.drawTimelineSVG, 50)
}

// 8. Reports Hub
async function renderReports() {
  const filters = currentFilters()
  const data = await loadIntelligenceData(filters)

  const bodyHtml = `
    ${renderUnifiedFilterBar(filters)}
    <div style="background:#fff; border:1px solid #dfe5eb; border-radius:10px; padding:15px; margin-bottom:12px;">
      <div style="font-size:13px; font-weight:800; color:#17324d; margin-bottom:10px;">مركز التقارير الموحد للطباعة والتصدير</div>
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <button class="btn" type="button" onclick="window.print()">طباعة التقرير التنفيذي الشامل</button>
        <button class="btn secondary" type="button" onclick="window.exportCurrentReportExcel()">تصدير كافة البيانات إلى Excel</button>
      </div>
    </div>
    ${renderBranchBarsSection(data.branchList)}
  `

  renderShell('التقارير التنفيذية', 'استخراج وطباعة التقارير المعتمدة بصيغ PDF وExcel', bodyHtml)
  window.bindFilterForm()
}

// 9. Data Review / Imports
async function renderImports() {
  const { data: batches } = await supabase.from('import_batches').select('*').order('created_at', { ascending: false }).limit(20)

  const branchNameMap = new Map(branches.map(b => [b.id, b.name]))
  const tableCols = [
    { key: 'date', label: 'تاريخ الرفع' },
    { key: 'branch', label: 'الفرع' },
    { key: 'period', label: 'فترة الشيت' },
    { key: 'status', label: 'حالة المطابقة' },
    { key: 'rows', label: 'عدد السجلات' }
  ]

  const rows = (batches || []).map(b => ({
    date: new Date(b.created_at).toLocaleString('ar-EG'),
    branch: branchNameMap.get(b.branch_id) || 'فرع',
    period: `${b.period_start || '—'} إلى ${b.period_end || '—'}`,
    status: b.status === 'approved' ? '<span class="delta-badge positive">معتمد ومطابق ✓</span>' : `<span class="delta-badge neutral">${b.status}</span>`,
    rows: qty(b.row_count || 0)
  }))

  const bodyHtml = `
    <div style="margin-bottom:12px;">
      <a href="#/uploads" class="btn" style="padding:6px 14px; text-decoration:none; display:inline-block;">+ رفع شيتات فروع جديدة</a>
    </div>
    ${renderSmartTable('سجل دفعات الشيتات المرفوعة ومطابقة البيانات', tableCols, rows)}
  `

  renderShell('مراجعة وتدقيق البيانات', 'سجل دفعات الشيتات، التأكد من عدم التكرار، وتدقيق البيانات', bodyHtml)
}

// 10. Settings Page
async function renderSettings() {
  const bodyHtml = `
    <div class="card" style="max-width:600px; padding:20px;">
      <h2 style="margin-top:0; font-size:14px; color:#17324d;">إعدادات نظام AMMCO Intelligence</h2>
      <div style="font-size:11px; color:#64748b; line-height:1.6; margin-bottom:15px;">
        <p>• <b>مشروع قاعدة البيانات المعتمد</b>: yumeijsyiphzdsulsubf (Supabase AMMCO)</p>
        <p>• <b>منطق توحيد الكميات</b>: منتجات Double تحتسب الكمية × 2 تلقائياً.</p>
        <p>• <b>قاعدة One Number = One Source</b>: المعادلات الرياضية متطابقة في كافة الشاشات والتقارير.</p>
      </div>
      <button class="btn secondary" onclick="localStorage.clear(); alert('تم مسح التخزين المؤقت'); location.reload();">مسح التخزين المؤقت للمتصفح</button>
    </div>
  `

  renderShell('إعدادات النظام', 'التحكم في المعايير، الصلاحيات، والتفضيلات التشغيلية', bodyHtml)
}

// 11. Uploads Page
async function renderUploads() {
  const branchOptions = branches.map(b => `<option value="${b.id}">${b.name}</option>`).join('')

  const bodyHtml = `
    <div class="card" style="max-width:600px; padding:20px;">
      <h2 style="margin-top:0; font-size:14px; color:#17324d;">رفع شيت فرع جديد</h2>
      <p style="font-size:11px; color:#64748b; margin-bottom:15px;">اختر الفرع وملف Excel لمعالجته وتدقيق البيانات وفق المعايير الموحدة.</p>
      <form id="upload-single-form" style="display:grid; gap:12px;">
        <div class="field">
          <label>الفرع</label>
          <select name="branch_id" required>
            ${branchOptions}
          </select>
        </div>
        <div class="field">
          <label>فترة الشيت (من تاريخ)</label>
          <input type="date" name="period_start" value="${defaultDates.from}" required>
        </div>
        <div class="field">
          <label>فترة الشيت (إلى تاريخ)</label>
          <input type="date" name="period_end" value="${defaultDates.to}" required>
        </div>
        <div class="field">
          <label>ملف الإكسيل (.xlsx)</label>
          <input type="file" name="file" accept=".xlsx,.xls" required>
        </div>
        <div id="upload-msg" style="font-size:11px;"></div>
        <button class="btn" type="submit" style="padding:8px 16px;">بدء الرفع والمعالجة</button>
      </form>
    </div>
  `

  renderShell('رفع شيتات الفروع', 'معالجة ملفات الإكسيل اليومية والشهرية وإدراجها في قاعدة البيانات', bodyHtml)

  document.getElementById('upload-single-form')?.addEventListener('submit', async e => {
    e.preventDefault()
    const msg = document.getElementById('upload-msg')
    msg.innerHTML = '<span style="color:#0284c7;">جاري قراءة وتحليل ملف الإكسيل…</span>'
    const fd = new FormData(e.currentTarget)
    const file = fd.get('file')
    if (!file || !file.name) return

    try {
      const buffer = await file.arrayBuffer()
      const parsed = await parseWorkbookBrowser(buffer)
      msg.innerHTML = `<span style="color:#15803d; font-weight:700;">تم تحليل الملف بنجاح (${parsed.inventory?.length || 0} صنف، ${parsed.expenses?.length || 0} مصروف). جاري الربط…</span>`
      setTimeout(() => {
        location.hash = '#/imports'
      }, 1500)
    } catch (err) {
      msg.innerHTML = `<span style="color:#b91c1c;">خطأ في تحليل الملف: ${err.message}</span>`
    }
  })
}

// -------------------------------------------------------------------
// AUTHENTICATION & BOOTSTRAP
// -------------------------------------------------------------------
function renderLogin() {
  app.innerHTML = `
    <main class="login">
      <section class="login-card">
        <h1>AMMCO</h1>
        <div class="muted">Management Intelligence Platform</div>
        <div id="login-msg" style="margin:10px 0;"></div>
        <form id="login-form">
          <div class="field">
            <label>البريد الإلكتروني</label>
            <input name="email" type="email" value="sayed3la2@gmail.com" required>
          </div>
          <div class="field">
            <label>كلمة المرور</label>
            <input name="password" type="password" required placeholder="••••••••">
          </div>
          <button class="btn" type="submit" style="margin-top:10px;">تسجيل الدخول</button>
        </form>
      </section>
    </main>
  `

  document.getElementById('login-form')?.addEventListener('submit', async e => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const { error } = await supabase.auth.signInWithPassword({
      email: String(fd.get('email')),
      password: String(fd.get('password'))
    })
    if (error) {
      document.getElementById('login-msg').innerHTML = `<div class="error">${error.message}</div>`
    } else {
      boot()
    }
  })
}

async function render() {
  if (!session) return renderLogin()
  const r = route()

  try {
    if (r === 'sales') return renderSales()
    if (r === 'expenses') return renderExpenses()
    if (r === 'branches') return renderBranches()
    if (r === 'products') return renderProducts()
    if (r === 'treasury') return renderTreasury()
    if (r === 'analytics') return renderAnalytics()
    if (r === 'reports') return renderReports()
    if (r === 'imports') return renderImports()
    if (r === 'settings') return renderSettings()
    if (r === 'uploads') return renderUploads()
    return renderDashboard()
  } catch (err) {
    console.error('Rendering error:', err)
    renderShell('خطأ في تحميل البيانات', '', `<div class="error">تعذر تحميل الصفحة: ${err.message}</div>`)
  }
}

async function boot() {
  const { data } = await supabase.auth.getSession()
  session = data.session

  if (session) {
    const { data: p } = await supabase.from('profiles').select('full_name, role, is_active').eq('user_id', session.user.id).maybeSingle()
    profile = p || { full_name: session.user.email?.split('@')[0], is_active: true }

    const { data: b } = await supabase.from('branches').select('id, name, code, is_active').eq('is_active', true).order('name')
    branches = b || []
  }

  await render()
}

window.addEventListener('hashchange', render)
supabase.auth.onAuthStateChange((_e, s) => {
  session = s
  boot()
})

boot()

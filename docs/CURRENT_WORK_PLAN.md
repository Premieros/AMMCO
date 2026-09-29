# AMMCO Current Work Plan

## Product scope
AMMCO is a centralized Excel intelligence system for distribution branches.

Each branch uploads its workbook. AMMCO validates, versions, stores, normalizes, and reports the data centrally.

## Mandatory infrastructure
- Repository: Premieros/AMMCO
- Supabase project: yumeijsyiphzdsulsubf (AMMCO)
- Any other Supabase project => STOP_AND_RECONCILE
- Source workbook analyzed: برج العرب سبتمبر 2026

## Phase 1 — Foundation
- [x] Initialize isolated repository
- [x] Add mandatory database-isolation rules
- [x] Analyze workbook sheet structure
- [x] Create secured Supabase schema
- [x] Create private workbook storage bucket
- [x] Create organization and first branch
- [x] Add upload/import status model
- [x] Add raw import preservation
- [x] Add normalized reporting facts
- [x] Verify RLS and security advisors

## Phase 2 — Import engine
- [x] Accept .xlsx only
- [x] Calculate SHA-256 before import
- [x] Detect branch + reporting period
- [x] Detect duplicate workbook
- [x] Parse DATA master data
- [x] Parse daily sheets (1..31 and carry-over sheets) — 12 rep blocks normalized
- [ ] Parse Total
- [ ] Parse تحليلي الفرع
- [x] Parse توريدات
- [ ] Parse الخزنة
- [x] Parse حركة المخزن
- [ ] Parse ملاحظات
- [x] Parse الجرد
- [x] Persist validation errors
- [ ] Publish normalized batch only after validation

## Phase 3 — Dashboard
- [ ] Branch/date filters
- [ ] Sales / net sales / discount KPIs
- [ ] Collections / receivables
- [ ] Cash and expenses
- [ ] Inventory and variances
- [ ] Rep performance
- [ ] Vehicle performance
- [ ] Customer visits
- [ ] Cross-branch comparison
- [ ] Drilldown to source batch and workbook version

## Import invariants
1. Same file hash cannot be imported twice for the same branch.
2. Same branch/business-date can have multiple versions, but only one approved version contributes to reports.
3. Re-uploading does not double count.
4. Raw imported rows remain traceable to batch/sheet/row.
5. Reports only use approved, non-superseded data.


## Deployment target
- [x] Hosting decision: Vercel project `ammco.foods`
- [x] Vercel project isolated from `premier.os`
- [ ] Configure AMMCO Supabase environment variables
- [ ] Publish development-branch preview
- [ ] Verify preview login, upload, import processing and reports
- [ ] Production deploy only after explicit approval

Deployment rule: `premier.os` is out of scope for AMMCO.


## Branch locking & treasury center
- [x] Admin can add branches from the portal.
- [x] Every new branch gets a default main treasury automatically.
- [x] Workbook uploads retain file hash, version, uploader and upload timestamp.
- [x] Parsed business days now receive deterministic snapshots and hashes.
- [x] Historical submitted days are compared on every later upload.
- [x] A changed locked day creates an explicit HISTORICAL_DAY_CHANGED validation error.
- [x] Historical changes are recorded in import_day_changes with old/new snapshots.
- [x] Only validated batches can be approved by an admin.
- [x] Approval supersedes the previous approved batch for the same branch/period.
- [x] Approval locks the submitted business days in branch_day_submissions.
- [x] Reports continue reading approved batches only.
- [x] Multi-treasury support added per branch.
- [x] Imported cash movements attach to the branch default treasury.
- [x] Treasury movement edits are audited; source date/code/amount remain locked.
- [x] Treasury center supports cumulative view, date range, multi-branch filtering, search, per-column filtering, sorting and column visibility.
- [x] Sales page supports the same Excel-like interaction model.
- [x] Expense analysis uses the same interaction model and audited drill-down correction.
- [x] Western 0-9 digits only in UI.
- [ ] Verify real next-day workbook upload against an already locked day using a second live branch workbook.
- [ ] Promote current development preview after final Vercel deployment is green.


## Phase 4 — Management intelligence replacement for consolidated Excel
Reference workbook: `اقفال 5 2026.xlsm`

- [x] Executive Branch Comparison page
  - current period sales, collections, opening/closing receivables
  - prior-month comparison
  - YTD sales
  - discount and expense ratios
  - latest inventory quantity/value
- [x] Expense Matrix page
  - expense category × branch
  - branch/company totals
  - expense-to-sales ratios
  - drill-through to approved expense entries
- [x] Representative Performance page
  - opening receivable, gross sales, discount, discount rate, net sales, deposit, representative expense when present in source payload, closing receivable
  - branch/date filters and drill-down
- [x] Inventory Movement page
  - opening, factory receipts, branch receipts, sales, bonuses, gifts, damages, factory returns, branch transfers, count adjustments, closing
- [x] Product Sales & Stock Matrix
  - product × branch quantity/value sales view
  - product × branch closing stock
  - company totals
- [x] Banks + YTD center
  - bank accounts by branch
  - grouped bank movements: CIB / QNB / الأهلي / مصر / القاهرة / other
  - YTD branch sales / discounts / collections / receivables / expenses
- [ ] Verify latest Phase 4 HEAD with Typecheck + Build
- [ ] Validate all Phase 4 totals against real approved AMMCO workbook data
- [ ] Add accrued-vs-cash expense model when source mapping is finalized
- [ ] Execute historical-day re-upload test with a real next-day workbook
- [ ] Final review before any merge

Phase 4 rule: calculations are database-derived from approved batches only; Excel formulas and external links are never a reporting source of truth.


### Live AMMCO verification — 2026-09-29
- [x] Direct access confirmed for Supabase project `yumeijsyiphzdsulsubf`.
- [x] Real approved Tanta batch reconciled across reporting sources:
  - gross sales 932,805
  - discounts 65,460
  - net sales 867,345
  - collections 626,892
  - expenses 114,364
  - opening receivables 178,433.82
  - closing receivables 418,886.82
  - sales quantity 3,274
  - closing inventory quantity 1,825.6667
  - closing inventory value 520,315
- [x] Dashboard corrected so all-branch closing receivables and inventory are summed from each branch's latest balance, not the last returned row.
- [x] Missing historical-period / representative-expense / product-detail / bank data is displayed as unavailable rather than zero.
- [ ] Existing operator-import batch is not yet covered by import day snapshots / locked days; historical re-upload protection must be validated on the first normal pipeline import.
- [ ] Product-level inventory movement is still unavailable: `inventory_daily` is empty and the current workbook parser only normalizes daily warehouse totals.
- [ ] Bank accounts/movements are not present in the current approved Tanta data.
- [ ] Reconcile migration history bookkeeping: live schema contains branch-locking/treasury functions and tables although migration history currently stops before those repository migrations.

Do not fabricate product-level movement from aggregate warehouse rows. Product matrices become authoritative only after a real workbook layout is available and the importer persists product-level facts.


### Reference workbook validation — uploaded files
- [x] Parsed `سبتمبر طنطا(1).xlsx` read-only and mapped product-level daily inventory from daily sheets.
  - Daily movement columns: AX barcode, AY opening, AZ factory in, BA branch in, BB sales qty, BC bonus, BD gifts, BE damages, BF factory return, BG branch out, BH adjustment, BI closing.
  - Product identity/value source: D product name, E inventory unit value.
  - Dry run: 1,872 inventory rows, 52 unique products, 2026-08-26 through 2026-09-30.
  - Daily movement reconciliation failures: 0.
  - September sales qty: 3,274.
  - September pre-discount product value (qty × unit value): 932,805, matching gross sales.
  - 2026-09-30 closing inventory value: 520,315.
- [x] Product-level parser and persistence added to the import pipeline; production data not rewritten.
- [x] Parsed management workbook `New Microsoft 14-6-2026 -.xlsm` read-only.
  - Reference accrual model confirmed: wages + branch manager + sector manager + rent.
  - Accrued-to-date model: monthly fixed accrual / working-day basis (26 in reference) × elapsed workdays + carried expenses.
  - Reference commission rate is 3% of sales.
- [x] Added branch monthly accrual settings model and Accrued vs Cash UI on development branch.
- [ ] Apply new migrations only after final verification and explicit approval.


### Integrity and migration closure — 2026-09-29
- [x] Approved and superseded import batches are immutable through the process endpoint; changes require a new upload/version.
- [x] Historical day hashes now include product-level inventory movement and inventory counts, not only branch totals.
- [x] Real Tanta treasury parser reads transaction rows A:G only; side summary tables are not reporting source-of-truth.
- [x] Transfer fees with blank category but description `مصروف تحويل` are classified from the real transaction row instead of relying on the workbook summary table.
- [x] Accrued-vs-cash model separates actual cash paid from analytical expense and prevents double-counting wages/rent/commissions.
- [x] Reference workbook formula independently confirmed:
  - working days use `NETWORKDAYS.INTL(...,"0000100")` = Friday excluded only;
  - accrued-to-date = monthly fixed / 26 × elapsed workdays + carried expenses;
  - estimated commission = 3% × sales.
- [x] Repository foundation migration versions aligned with the versions already recorded in AMMCO Supabase:
  - 20260929162541 foundation
  - 20260929162625 performance indexes
  - 20260929163449 profiles RLS fix
- [x] Pending locking/treasury migration hardened for replay: FK indexes added and overlapping SELECT/write RLS policies removed.
- [x] Supabase security advisor: no schema/RLS critical finding; only Auth leaked-password protection warning remains.
- [ ] Apply/record pending migrations only after final approval:
  - 20260929193000 cash entry correction audit (schema already present; replay-safe reconciliation)
  - 20260929222500 branch/day locking + treasury (schema already present; replay-safe reconciliation plus index/RLS cleanup)
  - 20260929231000 representative expense amount
  - 20260929232000 monthly accrual settings
- [ ] After migrations: upload the real Tanta workbook through the normal pipeline, verify 1,872 product movement rows / 52 products / zero daily reconciliation differences, then approve.
- [ ] Re-upload a changed historical day and confirm `HISTORICAL_DAY_CHANGED` blocks approval until explicit resolution.
- [ ] Final advisor sweep and PR verification before requesting merge approval.

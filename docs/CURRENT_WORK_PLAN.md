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

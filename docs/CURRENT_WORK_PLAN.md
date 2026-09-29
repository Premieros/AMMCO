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
- [ ] Create secured Supabase schema
- [ ] Create private workbook storage bucket
- [ ] Create organization and first branch
- [ ] Add upload/import status model
- [ ] Add raw import preservation
- [ ] Add normalized reporting facts
- [ ] Verify RLS and security advisors

## Phase 2 — Import engine
- [ ] Accept .xlsx only
- [ ] Calculate SHA-256 before import
- [ ] Detect branch + reporting period
- [ ] Detect duplicate workbook
- [ ] Parse DATA master data
- [ ] Parse daily sheets (1..31 and carry-over sheets)
- [ ] Parse Total
- [ ] Parse تحليلي الفرع
- [ ] Parse توريدات
- [ ] Parse الخزنة
- [ ] Parse حركة المخزن
- [ ] Parse ملاحظات
- [ ] Parse الجرد
- [ ] Persist validation errors
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

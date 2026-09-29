# Excel Import Contract

## Workbook families observed
The reference workbook contains:
- DATA
- الفرع
- daily sheets: 1..31 plus carry-over sheets like 26-, 27-, ...
- Total
- تحليلي الفرع
- توريدات
- الخزنة
- حركة المخزن
- ملاحظات
- الجرد

## Reporting domains observed
- product catalog, packs and selling prices
- daily branch sales and discounts
- collections and receivables
- sales-rep balances and performance
- vehicle/driver sales and expenses
- cashbox inflows/outflows and expense classifications
- warehouse movements
- inventory counts across warehouses and vehicles
- customer visits
- returns, bonuses, gifts, damages and adjustments

## Import strategy
AMMCO uses two layers:

### 1. Immutable trace layer
Every meaningful source row is preserved as JSON with:
- batch id
- sheet name
- source row number
- raw payload

This is the audit/reprocessing source.

### 2. Normalized reporting layer
Validated data is written into typed fact tables for fast dashboards.

## Batch lifecycle
uploaded -> processing -> validated -> approved

Failure states:
- rejected
- failed
- superseded

Only approved/non-superseded batches contribute to dashboard views.

## Duplicate protection
- SHA-256 identifies an identical file.
- unique(branch_id, file_sha256) prevents the same workbook from being imported twice for a branch.
- version is unique per branch + reporting period.

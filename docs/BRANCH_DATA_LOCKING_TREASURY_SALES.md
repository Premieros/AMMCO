# Branch Data Locking, Treasury & Sales Architecture

## Core rule
A branch may submit a new workbook, but it may not silently rewrite a business day that was already approved.

Each successful workbook processing produces one deterministic snapshot per business date. The snapshot covers the day-specific representative data, remittances, warehouse movement and treasury movement.

## Upload lifecycle
1. Uploaded workbook is stored privately in Supabase Storage.
2. The batch records uploader, upload timestamp, file SHA-256 and version.
3. Workbook is parsed into staged normalized rows.
4. Each business date receives a snapshot and source hash.
5. If the same date is already locked:
   - identical hash: allowed;
   - different hash: batch receives HISTORICAL_DAY_CHANGED and is rejected for normal approval.
6. Admin reviews the batch from the Import Review Center.
7. Only a validated batch with no unresolved historical changes can be approved.
8. Approval atomically supersedes the previous approved batch for the branch/period and locks all days from the new version.

## Source preservation
The original workbook remains private and versioned. Administrative corrections never rewrite source Excel values.

For treasury movements:
- source date: locked;
- source code: locked;
- source amount/direction: locked;
- description: editable by admin with reason;
- treasury assignment: editable by admin with reason;
- analytical direction/category/group: editable by admin with reason.

Every allowed edit is recorded in the correction audit log.

## Treasury accounts
Each branch has a default main treasury and can have additional cash, bank or other treasury accounts.

Imported treasury movements are attached to the default branch treasury unless a later audited administrative correction assigns a different treasury.

## Interactive reporting
Treasury, sales and expense pages use the same interaction model:
- cumulative data;
- date range;
- one or multiple branches;
- global search;
- per-column search;
- sortable columns;
- show/hide columns;
- row drill-down;
- Western digits 0-9.

## Sales
Sales pages read only approved batches and show:
- gross sales;
- discounts and discount ratio;
- net sales;
- sold quantity;
- collections;
- opening/closing receivables;
- expenses;
- closing cash;
- inventory value.

## Security
- RLS remains enabled.
- Branch users see only branches they are granted.
- Admin writes require organization-level admin role.
- No service role or secret key is exposed to the browser.
- Public reports are based on approved data only.

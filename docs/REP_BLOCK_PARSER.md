# Representative Block Parser

## Reference workbook rule
The current branch workbook is expected to contain **12 sales representatives**.

The workbook supplied for analysis intentionally contains one representative so the parser can trace every field belonging to that representative before scaling horizontally.

## Critical observation
The financial cells above each representative name belong to that representative's block. They must never be treated as branch-wide totals.

At minimum the block captures:
- representative name (anchor)
- representative slot/order
- sales before discount, when present
- discount
- net value after discount
- daily deposit / tawreed
- opening/closing balance where present
- collection/receivable metrics where present
- vehicle/driver references where present

## Parsing rule
1. Discover representative-name anchors from the daily sheet.
2. Read the financial block above each anchor by relative position/template labels.
3. Assign the block a `rep_slot` from left to right.
4. Expected slot count for the current template: **12**.
5. Do not hard-fail if fewer slots are populated; blank slots are valid.
6. More than 12 populated slots must be preserved and flagged as a template-change warning rather than discarded.
7. Persist the representative name cell as `source_anchor_cell` for auditability.
8. Store normalized results in `sales_rep_daily`.
9. Preserve raw rows/cells in the immutable import layer so parser logic can be rerun later.

## Validation
A batch is not approvable if:
- the same populated representative appears twice on the same day;
- a populated representative block has no identifiable name anchor;
- financial values are mapped across two representative blocks;
- the block-to-branch/day relationship is ambiguous.

A mismatch between the expected 12 slots and actual populated count is a warning unless structural ambiguity exists.

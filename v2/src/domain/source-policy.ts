export const SOURCE_POLICY={
 sales:'sales_rep_daily',
 branchSales:'SUM(sales_rep_daily.net_after_discount)',
 discounts:'sales_rep_daily.discounts',
 quantities:'sales_rep_daily.raw_payload.equivalent_sales_qty',
 receivables:'rep_remittance_daily / approved reporting layer',
 cash:'cash_entries',
 petroUp:'vehicle_daily where raw_payload.non_cash=true',
 vehicles:'vehicle assignment master',
 monthlyAccruals:'branch_expense_accrual_settings',
 inventory:'inventory_daily / warehouse_daily_summary',
} as const

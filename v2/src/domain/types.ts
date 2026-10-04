export type Role='admin'|'analyst'|'branch_user'
export type Period={from:string;to:string;month:string}
export type Branch={id:string;name:string;code:string|null;is_active:boolean}
export type Profile={user_id:string;full_name:string|null;role:Role;is_active:boolean;organization_id:string}
export type BranchKpi={branch_id:string;branch_name:string;business_date:string;gross_sales:number;net_sales:number;discounts:number;collections:number;opening_receivables:number;closing_receivables:number;expenses:number;closing_cash:number}

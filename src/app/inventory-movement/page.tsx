import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { createClient } from '@/lib/supabase/server'

export const dynamic='force-dynamic'
type Row={branch_id:string;business_date:string;product_id:string|null;product_name:string;opening_qty:number;incoming_factory_qty:number;incoming_branches_qty:number;sales_qty:number;bonus_qty:number;gifts_qty:number;damages_qty:number;return_factory_qty:number;outgoing_branches_qty:number;adjustments_qty:number;closing_qty:number;unit_value:number|null;closing_value:number|null}
function n(v:unknown){return Number(v??0)}
function num(v:number,d=2){return new Intl.NumberFormat('en-US',{maximumFractionDigits:d}).format(v)}
function money(v:number){return new Intl.NumberFormat('en-US',{style:'currency',currency:'EGP',maximumFractionDigits:0}).format(v)}
export default async function InventoryMovement({searchParams}:{searchParams:Promise<{branch?:string;from?:string;to?:string}>}){
 const f=await searchParams, from=f.from??'2026-09-01', to=f.to??'2026-09-30'
 const supabase=await createClient(); const {data:auth}=await supabase.auth.getClaims(); if(!auth?.claims?.sub) redirect('/login')
 const {data:approvedBatches}=await supabase.from('import_batches').select('id').eq('status','approved')
 const approvedIds=(approvedBatches??[]).map(b=>b.id)
 let q=supabase.from('inventory_daily').select('branch_id,business_date,product_id,product_name,opening_qty,incoming_factory_qty,incoming_branches_qty,sales_qty,bonus_qty,gifts_qty,damages_qty,return_factory_qty,outgoing_branches_qty,adjustments_qty,closing_qty,unit_value,closing_value').in('batch_id',approvedIds.length?approvedIds:['00000000-0000-0000-0000-000000000000']).gte('business_date',from).lte('business_date',to).order('business_date')
 if(f.branch) q=q.eq('branch_id',f.branch)
 const [{data},{data:branchesData}]=await Promise.all([q,supabase.from('branches').select('id,name').eq('is_active',true).order('name')])
 const branchNames=new Map((branchesData??[]).map(b=>[b.id,b.name] as const)); const rows=(data??[]) as Row[]
 type A={branchId:string;product:string;opening:number;factory:number;branchIn:number;sales:number;bonus:number;gifts:number;damages:number;returns:number;branchOut:number;adjust:number;closing:number;closingValue:number;first:string;last:string}
 const m=new Map<string,A>()
 for(const x of rows){const productKey=x.product_id??`name:${x.product_name.replace(/\s+/g,' ').trim().toLowerCase()}`;const k=`${x.branch_id}::${productKey}`;const r=m.get(k)??{branchId:x.branch_id,product:x.product_name,opening:n(x.opening_qty),factory:0,branchIn:0,sales:0,bonus:0,gifts:0,damages:0,returns:0,branchOut:0,adjust:0,closing:0,closingValue:0,first:x.business_date,last:x.business_date};if(x.business_date<r.first){r.first=x.business_date;r.opening=n(x.opening_qty)};if(x.business_date>=r.last){r.last=x.business_date;r.closing=n(x.closing_qty);r.closingValue=n(x.closing_value)};r.factory+=n(x.incoming_factory_qty);r.branchIn+=n(x.incoming_branches_qty);r.sales+=n(x.sales_qty);r.bonus+=n(x.bonus_qty);r.gifts+=n(x.gifts_qty);r.damages+=n(x.damages_qty);r.returns+=n(x.return_factory_qty);r.branchOut+=n(x.outgoing_branches_qty);r.adjust+=n(x.adjustments_qty);m.set(k,r)}
 const out=[...m.values()].sort((a,b)=>a.product.localeCompare(b.product,'ar'))
 return <AppShell title="حركة المخزون" subtitle="رصيد أول ووارد ومبيعات وبوانص وهدايا وتوالف ومرتجعات وتحويلات وتسويات ورصيد آخر">
  <form className="card filters" method="get"><div className="field"><label>الفرع</label><select name="branch" defaultValue={f.branch??''}><option value="">كل الفروع</option>{(branchesData??[]).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div><div className="field"><label>من</label><input type="date" name="from" defaultValue={from}/></div><div className="field"><label>إلى</label><input type="date" name="to" defaultValue={to}/></div><div className="field filter-action"><label>&nbsp;</label><button className="btn">تطبيق</button></div></form>
  <section className="card"><div className="table-wrap"><table><thead><tr><th>الفرع</th><th>الصنف</th><th>رصيد أول</th><th>وارد مصنع</th><th>وارد فروع</th><th>مبيعات</th><th>بوانص</th><th>هدايا</th><th>توالف</th><th>مرتجع مصنع</th><th>تحويلات فروع</th><th>تسوية جرد</th><th>رصيد آخر</th><th>قيمة الرصيد</th></tr></thead><tbody>{out.map(r=><tr key={`${r.branchId}-${r.product}`}><td>{branchNames.get(r.branchId)??'-'}</td><td>{r.product}</td><td>{num(r.opening)}</td><td>{num(r.factory)}</td><td>{num(r.branchIn)}</td><td>{num(r.sales)}</td><td>{num(r.bonus)}</td><td>{num(r.gifts)}</td><td>{num(r.damages)}</td><td>{num(r.returns)}</td><td>{num(r.branchOut)}</td><td>{num(r.adjust)}</td><td>{num(r.closing)}</td><td>{money(r.closingValue)}</td></tr>)}</tbody></table></div></section>
 </AppShell>
}
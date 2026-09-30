import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { SmartTable } from '@/components/smart-table'
import { createClient } from '@/lib/supabase/server'

export const dynamic='force-dynamic'
type Row={branch_id:string;business_date:string;product_id:string|null;product_name:string;opening_qty:number;incoming_factory_qty:number;incoming_branches_qty:number;sales_qty:number;bonus_qty:number;gifts_qty:number;damages_qty:number;return_factory_qty:number;outgoing_branches_qty:number;adjustments_qty:number;closing_qty:number;unit_value:number|null;closing_value:number|null}
function n(v:unknown){return Number(v??0)}
function num(v:number,d=2){return new Intl.NumberFormat('en-US',{maximumFractionDigits:d}).format(v)}
function money(v:number){return new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(v)}

export default async function InventoryMovement({searchParams}:{searchParams:Promise<{branch?:string;from?:string;to?:string}>}){
 const f=await searchParams, from=f.from??'2026-09-01', to=f.to??'2026-09-30'
 const supabase=await createClient()
 const {data:auth}=await supabase.auth.getClaims()
 if(!auth?.claims?.sub) redirect('/login')

 const {data:approvedBatches}=await supabase.from('import_batches').select('id').eq('status','approved')
 const approvedIds=(approvedBatches??[]).map(b=>b.id)
 let q=supabase.from('inventory_daily')
  .select('branch_id,business_date,product_id,product_name,opening_qty,incoming_factory_qty,incoming_branches_qty,sales_qty,bonus_qty,gifts_qty,damages_qty,return_factory_qty,outgoing_branches_qty,adjustments_qty,closing_qty,unit_value,closing_value')
  .in('batch_id',approvedIds.length?approvedIds:['00000000-0000-0000-0000-000000000000'])
  .gte('business_date',from).lte('business_date',to).order('business_date')
 if(f.branch) q=q.eq('branch_id',f.branch)

 const [{data},{data:branchesData}]=await Promise.all([
  q,
  supabase.from('branches').select('id,name').eq('is_active',true).order('name')
 ])
 const branchNames=new Map((branchesData??[]).map(b=>[b.id,b.name] as const))
 const rows=(data??[]) as Row[]

 type A={branchId:string;product:string;opening:number;factory:number;branchIn:number;sales:number;bonus:number;gifts:number;damages:number;returns:number;branchOut:number;adjust:number;closing:number;closingValue:number;first:string;last:string}
 const m=new Map<string,A>()
 for(const x of rows){
  const productKey=x.product_id??`name:${x.product_name.replace(/\s+/g,' ').trim().toLowerCase()}`
  const k=`${x.branch_id}::${productKey}`
  const r=m.get(k)??{branchId:x.branch_id,product:x.product_name,opening:n(x.opening_qty),factory:0,branchIn:0,sales:0,bonus:0,gifts:0,damages:0,returns:0,branchOut:0,adjust:0,closing:0,closingValue:0,first:x.business_date,last:x.business_date}
  if(x.business_date<r.first){r.first=x.business_date;r.opening=n(x.opening_qty)}
  if(x.business_date>=r.last){r.last=x.business_date;r.closing=n(x.closing_qty);r.closingValue=n(x.closing_value)}
  r.factory+=n(x.incoming_factory_qty);r.branchIn+=n(x.incoming_branches_qty);r.sales+=n(x.sales_qty);r.bonus+=n(x.bonus_qty);r.gifts+=n(x.gifts_qty);r.damages+=n(x.damages_qty);r.returns+=n(x.return_factory_qty);r.branchOut+=n(x.outgoing_branches_qty);r.adjust+=n(x.adjustments_qty)
  m.set(k,r)
 }
 const out=[...m.values()].sort((a,b)=>a.product.localeCompare(b.product,'ar'))
 const totals=out.reduce((a,r)=>({opening:a.opening+r.opening,factory:a.factory+r.factory,branchIn:a.branchIn+r.branchIn,sales:a.sales+r.sales,bonus:a.bonus+r.bonus,gifts:a.gifts+r.gifts,damages:a.damages+r.damages,returns:a.returns+r.returns,branchOut:a.branchOut+r.branchOut,adjust:a.adjust+r.adjust,closing:a.closing+r.closing,closingValue:a.closingValue+r.closingValue}),{opening:0,factory:0,branchIn:0,sales:0,bonus:0,gifts:0,damages:0,returns:0,branchOut:0,adjust:0,closing:0,closingValue:0})

 const tableRows=out.map(r=>({
  branch_name:branchNames.get(r.branchId)??'-',
  product:r.product,
  opening:num(r.opening),factory:num(r.factory),branch_in:num(r.branchIn),sales:num(r.sales),bonus:num(r.bonus),gifts:num(r.gifts),damages:num(r.damages),returns:num(r.returns),branch_out:num(r.branchOut),adjust:num(r.adjust),closing:num(r.closing),closing_value:money(r.closingValue)
 }))

 return <AppShell title="تقرير حركة المخزون" subtitle="رصيد أول، وارد، مبيعات، بوانص، هدايا، توالف، مرتجعات، تحويلات وتسويات حتى رصيد آخر" breadcrumbs={[{label:'لوحة الإدارة',href:'/'},{label:'حركة المخزون'}]}>
  <form className="card filters" method="get">
   <div className="field"><label>الفرع</label><select name="branch" defaultValue={f.branch??''}><option value="">كل الفروع</option>{(branchesData??[]).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
   <div className="field"><label>من</label><input type="date" name="from" defaultValue={from}/></div>
   <div className="field"><label>إلى</label><input type="date" name="to" defaultValue={to}/></div>
   <div className="field filter-action"><label>&nbsp;</label><button className="btn">تطبيق التقرير</button></div>
  </form>

  <div className="report-scope">
   <span className="scope-chip">الفرع: <strong>{(branchesData??[]).find(b=>b.id===f.branch)?.name??'كل الفروع'}</strong></span>
   <span className="scope-chip">الفترة: <strong>{from} → {to}</strong></span>
   <span className="scope-chip">عدد البنود: <strong>{out.length}</strong></span>
  </div>

  <section className="grid portal-kpis">
   <div className="card"><div className="kpi-label">رصيد أول</div><div className="kpi-value">{num(totals.opening)}</div></div>
   <div className="card"><div className="kpi-label">وارد مصنع</div><div className="kpi-value">{num(totals.factory)}</div></div>
   <div className="card"><div className="kpi-label">مبيعات كمية</div><div className="kpi-value">{num(totals.sales)}</div></div>
   <div className="card"><div className="kpi-label">رصيد آخر</div><div className="kpi-value">{num(totals.closing)}</div><div className="muted">قيمة {money(totals.closingValue)}</div></div>
  </section>

  <section className="report-sheet">
   <div className="report-sheet-head"><h2>حركة المخزون حسب الصنف والفرع</h2><span>نفس منطق شيت الإدارة مع فصل أنواع الحركة</span></div>
   <div className="table-wrap"><table>
    <thead>
     <tr>
      <th rowSpan={2} className="group-slate">الفرع</th><th rowSpan={2} className="group-slate">الصنف</th>
      <th colSpan={3} className="group-blue">الأرصدة والوارد</th>
      <th colSpan={4} className="group-green">الخروج والمبيعات</th>
      <th colSpan={3} className="group-orange">المرتجعات والتحويلات</th>
      <th colSpan={2} className="group-gold">الرصيد النهائي</th>
     </tr>
     <tr>
      <th>رصيد أول</th><th>وارد مصنع</th><th>وارد فروع</th>
      <th>مبيعات</th><th>بوانص</th><th>هدايا</th><th>توالف</th>
      <th>مرتجع مصنع</th><th>تحويلات فروع</th><th>تسوية جرد</th>
      <th>رصيد آخر</th><th>قيمة الرصيد</th>
     </tr>
    </thead>
    <tbody>
     {out.map(r=><tr key={`${r.branchId}-${r.product}`}>
      <td className="row-label">{branchNames.get(r.branchId)??'-'}</td><td>{r.product}</td>
      <td className="num">{num(r.opening)}</td><td className="num">{num(r.factory)}</td><td className="num">{num(r.branchIn)}</td>
      <td className="num">{num(r.sales)}</td><td className="num">{num(r.bonus)}</td><td className="num">{num(r.gifts)}</td><td className="num">{num(r.damages)}</td>
      <td className="num">{num(r.returns)}</td><td className="num">{num(r.branchOut)}</td><td className="num">{num(r.adjust)}</td>
      <td className="num"><strong>{num(r.closing)}</strong></td><td className="num"><strong>{money(r.closingValue)}</strong></td>
     </tr>)}
     <tr className="total-row">
      <th colSpan={2}>الإجمالي</th>
      <th>{num(totals.opening)}</th><th>{num(totals.factory)}</th><th>{num(totals.branchIn)}</th>
      <th>{num(totals.sales)}</th><th>{num(totals.bonus)}</th><th>{num(totals.gifts)}</th><th>{num(totals.damages)}</th>
      <th>{num(totals.returns)}</th><th>{num(totals.branchOut)}</th><th>{num(totals.adjust)}</th>
      <th>{num(totals.closing)}</th><th>{money(totals.closingValue)}</th>
     </tr>
    </tbody>
   </table></div>
  </section>

  <div style={{marginTop:16}}><SmartTable title="بحث وتصفية حركة المخزون" rows={tableRows} columns={[
   {key:'branch_name',label:'الفرع'},{key:'product',label:'الصنف'},{key:'opening',label:'رصيد أول',numeric:true},{key:'factory',label:'وارد مصنع',numeric:true},{key:'branch_in',label:'وارد فروع',numeric:true},{key:'sales',label:'مبيعات',numeric:true},{key:'bonus',label:'بوانص',numeric:true},{key:'gifts',label:'هدايا',numeric:true},{key:'damages',label:'توالف',numeric:true},{key:'returns',label:'مرتجع مصنع',numeric:true},{key:'branch_out',label:'تحويلات فروع',numeric:true},{key:'adjust',label:'تسوية جرد',numeric:true},{key:'closing',label:'رصيد آخر',numeric:true},{key:'closing_value',label:'قيمة الرصيد',numeric:true}
  ]}/></div>
 </AppShell>
}

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { createClient } from '@/lib/supabase/server'

export const dynamic='force-dynamic'
type Row={branch_id:string;business_date:string;product_id:string|null;product_name:string;sales_qty:number;unit_value:number|null;closing_qty:number;closing_value:number|null}
function n(v:unknown){return Number(v??0)}
function num(v:number,d=2){return new Intl.NumberFormat('en-US',{maximumFractionDigits:d}).format(v)}
function money(v:number){return new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(v)}

export default async function ProductMatrix({searchParams}:{searchParams:Promise<{branch?:string;from?:string;to?:string}>}){
 const f=await searchParams,from=f.from??'2026-09-01',to=f.to??'2026-09-30'
 const supabase=await createClient()
 const {data:auth}=await supabase.auth.getClaims()
 if(!auth?.claims?.sub)redirect('/login')

 const {data:approvedBatches}=await supabase.from('import_batches').select('id').eq('status','approved')
 const approvedIds=(approvedBatches??[]).map(b=>b.id)
 const approvedFilter=approvedIds.length?approvedIds:['00000000-0000-0000-0000-000000000000']

 let inventoryQuery=supabase.from('inventory_daily').select('branch_id,business_date,product_id,product_name,sales_qty,unit_value,closing_qty,closing_value').in('batch_id',approvedFilter).gte('business_date',from).lte('business_date',to).order('business_date')
 let warehouseQuery=supabase.from('warehouse_daily_summary').select('branch_id,business_date,sales_qty,sales_value,closing_qty,closing_value').in('batch_id',approvedFilter).gte('business_date',from).lte('business_date',to).order('business_date')
 if(f.branch){inventoryQuery=inventoryQuery.eq('branch_id',f.branch);warehouseQuery=warehouseQuery.eq('branch_id',f.branch)}

 const [{data},{data:branchesData},{data:warehouseData}]=await Promise.all([
  inventoryQuery,
  supabase.from('branches').select('id,name').eq('is_active',true).order('name'),
  warehouseQuery
 ])
 const rows=(data??[]) as Row[]
 const allBranches=(branchesData??[]) as {id:string;name:string}[]
 const branches=f.branch?allBranches.filter(b=>b.id===f.branch):allBranches

 type Cell={salesQty:number;salesValue:number;closingQty:number;closingValue:number;last:string}
 type ProductRow={name:string;cells:Map<string,Cell>}
 const matrix=new Map<string,ProductRow>()
 for(const x of rows){
  const key=x.product_id??`name:${x.product_name.replace(/\s+/g,' ').trim().toLowerCase()}`
  const pr=matrix.get(key)??{name:x.product_name,cells:new Map<string,Cell>()}
  const cell=pr.cells.get(x.branch_id)??{salesQty:0,salesValue:0,closingQty:0,closingValue:0,last:''}
  cell.salesQty+=n(x.sales_qty)
  cell.salesValue+=n(x.sales_qty)*n(x.unit_value)
  if(x.business_date>=cell.last){cell.last=x.business_date;cell.closingQty=n(x.closing_qty);cell.closingValue=n(x.closing_value)}
  pr.cells.set(x.branch_id,cell);matrix.set(key,pr)
 }
 const warehouse=(warehouseData??[]) as {branch_id:string;business_date:string;sales_qty:number;sales_value:number;closing_qty:number;closing_value:number}[]
 const aggregate={
  salesQty:warehouse.reduce((s,r)=>s+n(r.sales_qty),0),
  salesValue:warehouse.reduce((s,r)=>s+n(r.sales_value),0),
  closingQty:warehouse.reduce((s,r)=>s+n(r.closing_qty),0),
  closingValue:warehouse.reduce((s,r)=>s+n(r.closing_value),0)
 }
 const products=[...matrix.entries()].sort((a,b)=>a[1].name.localeCompare(b[1].name,'ar'))
 return <AppShell title="مصفوفة مبيعات ومخزون الأصناف" subtitle="تقرير إدارة كثيف على نمط شيت الإدارة: الصنف × الفروع مع كمية البيع والقيمة والرصيد" breadcrumbs={[{label:'لوحة الإدارة',href:'/'},{label:'مصفوفة الأصناف'}]}>
  <form className="card filters" method="get">
   <div className="field"><label>الفرع</label><select name="branch" defaultValue={f.branch??''}><option value="">كل الفروع</option>{allBranches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
   <div className="field"><label>من</label><input type="date" name="from" defaultValue={from}/></div>
   <div className="field"><label>إلى</label><input type="date" name="to" defaultValue={to}/></div>
   <div className="field filter-action"><label>&nbsp;</label><button className="btn">تطبيق التقرير</button></div>
  </form>
  <div className="report-scope"><span className="scope-chip">الفرع: <strong>{allBranches.find(b=>b.id===f.branch)?.name??'كل الفروع'}</strong></span><span className="scope-chip">الفترة: <strong>{from} → {to}</strong></span><span className="scope-chip">عدد الأصناف: <strong>{products.length}</strong></span></div>
  <section className="grid portal-kpis">
   <div className="card"><div className="kpi-label">كمية البيع</div><div className="kpi-value">{num(aggregate.salesQty)}</div></div>
   <div className="card"><div className="kpi-label">قيمة البيع قبل الخصم</div><div className="kpi-value">{money(aggregate.salesValue)}</div></div>
   <div className="card"><div className="kpi-label">رصيد المخزون كمية</div><div className="kpi-value">{num(aggregate.closingQty)}</div></div>
   <div className="card"><div className="kpi-label">قيمة المخزون</div><div className="kpi-value">{money(aggregate.closingValue)}</div></div>
  </section>
  <section className="report-sheet">
   <div className="report-sheet-head"><h2>Product Sales & Stock Matrix</h2><span>اضغط اسم الصنف لفتح حركة المخزون التفصيلية</span></div>
   {products.length===0?<div className="notice" style={{margin:12}}>تفاصيل الأصناف غير متاحة بعد للفترة/الفرع المحدد.</div>:null}
   <div className="table-wrap"><table>
    <thead>
     <tr>
      <th rowSpan={2} className="group-slate">الصنف</th>
      {branches.map((b,i)=><th key={b.id} colSpan={3} className={i%2===0?'group-blue':'group-green'}>{b.name}</th>)}
      <th colSpan={3} className="group-gold">إجمالي الشركة</th>
     </tr>
     <tr>
      {branches.flatMap(b=>[
       <th key={b.id+'q'}>كمية البيع</th>,
       <th key={b.id+'v'}>قيمة البيع</th>,
       <th key={b.id+'s'}>رصيد آخر</th>
      ])}
      <th>كمية البيع</th><th>قيمة البيع</th><th>رصيد آخر</th>
     </tr>
    </thead>
    <tbody>
     {products.map(([productKey,productRow])=>{let tq=0,tv=0,sq=0;for(const c of productRow.cells.values()){tq+=c.salesQty;tv+=c.salesValue;sq+=c.closingQty}return <tr key={productKey}>
      <td className="row-label"><Link className="row-link" href={`/inventory-movement?from=${from}&to=${to}`}>{productRow.name}</Link></td>
      {branches.flatMap(b=>{const c=productRow.cells.get(b.id);return [
       <td className="num matrix-cell" key={b.id+'q'}>{num(c?.salesQty??0)}</td>,
       <td className="num matrix-cell" key={b.id+'v'}>{money(c?.salesValue??0)}</td>,
       <td className="num matrix-cell" key={b.id+'s'}>{num(c?.closingQty??0)}</td>
      ]})}
      <td className="num"><strong>{num(tq)}</strong></td><td className="num"><strong>{money(tv)}</strong></td><td className="num"><strong>{num(sq)}</strong></td>
     </tr>})}
    </tbody>
   </table></div>
   <div className="report-sheet-caption">قيمة البيع هنا قبل الخصم = كمية البيع × قيمة الوحدة. صافي المبيعات بعد الخصم يظهر في تقرير المبيعات والتقرير التنفيذي.</div>
  </section>
 </AppShell>
}

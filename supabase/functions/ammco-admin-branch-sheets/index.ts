import { createClient } from 'npm:@supabase/supabase-js@2.117.2'

const cors={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS'
}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}})

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors})
  if(req.method!=='POST')return json({error:'Method not allowed'},405)

  const authHeader=req.headers.get('Authorization')??''
  if(!authHeader.startsWith('Bearer '))return json({error:'غير مصرح'},401)

  const url=Deno.env.get('SUPABASE_URL')!
  const publishable=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')!)[ 'default' ]
  const secret=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')!)[ 'default' ]
  const userClient=createClient(url,publishable,{global:{headers:{Authorization:authHeader}},auth:{persistSession:false,autoRefreshToken:false}})
  const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})

  const {data:u}=await userClient.auth.getUser()
  const uid=u?.user?.id
  if(!uid)return json({error:'غير مصرح'},401)

  const {data:me,error:meErr}=await admin.from('profiles').select('organization_id,role,is_active').eq('user_id',uid).maybeSingle()
  if(meErr)return json({error:meErr.message},500)
  if(!me?.is_active||me.role!=='admin')return json({error:'صلاحية المدير مطلوبة لتعديل محتويات الشيت'},403)

  try{
    const body=await req.json()
    const batchId=String(body?.batchId||'').trim()
    const branchId=String(body?.branchId||'').trim()
    const inventoryEdits=Array.isArray(body?.inventoryEdits)?body.inventoryEdits:[]
    const repEdits=Array.isArray(body?.repEdits)?body.repEdits:[]
    const cashEdits=Array.isArray(body?.cashEdits)?body.cashEdits:[]
    const cashNew=Array.isArray(body?.cashNew)?body.cashNew:[]
    const cashDeletes=Array.isArray(body?.cashDeletes)?body.cashDeletes.map((x:any)=>Number(x)).filter((x:number)=>Number.isInteger(x)&&x>0):[]
    const warehouseEdits=Array.isArray(body?.warehouseEdits)?body.warehouseEdits:[]

    if(!batchId||!branchId)return json({error:'بيانات الدفعة أو الفرع ناقصة'},400)

    const {data:branch,error:branchErr}=await admin.from('branches').select('id,organization_id').eq('id',branchId).maybeSingle()
    if(branchErr)return json({error:branchErr.message},500)
    if(!branch||branch.organization_id!==me.organization_id)return json({error:'الفرع لا يتبع المؤسسة الحالية'},403)

    const {data:batch,error:batchErr}=await admin.from('import_batches').select('id,branch_id').eq('id',batchId).maybeSingle()
    if(batchErr)return json({error:batchErr.message},500)
    if(!batch||batch.branch_id!==branchId)return json({error:'الدفعة لا تنتمي إلى الفرع المحدد'},400)

    const affectedDates=new Set<string>()

    for(const edit of inventoryEdits){
      const id=Number(edit?.id);if(!Number.isInteger(id)||id<=0)continue
      const p:Record<string,unknown>={}
      for(const key of ['sales_qty','unit_value','opening_qty','incoming_factory_qty','incoming_branches_qty','bonus_qty','gifts_qty','damages_qty','return_factory_qty','outgoing_branches_qty','adjustments_qty','closing_qty','closing_value']){
        if(edit[key]!==undefined)p[key]=Number(edit[key])
      }
      if(edit.product_name!==undefined)p.product_name=String(edit.product_name).trim()
      if(edit.barcode!==undefined)p.barcode=String(edit.barcode||'').trim()||null
      if(Object.keys(p).length===0)continue
      const {data:updated,error}=await admin.from('inventory_daily').update(p).eq('id',id).eq('batch_id',batchId).eq('branch_id',branchId).select('business_date').maybeSingle()
      if(error)throw new Error('تعديل حركة المخزون: '+error.message)
      if(updated?.business_date)affectedDates.add(updated.business_date)
    }

    for(const edit of repEdits){
      const id=Number(edit?.id);if(!Number.isInteger(id)||id<=0)continue
      const p:Record<string,unknown>={}
      if(edit.rep_name!==undefined)p.rep_name=String(edit.rep_name).trim()
      for(const key of ['opening_balance','sales_before_discount','discounts','net_after_discount','deposit_amount','expense_amount','closing_balance']){
        if(edit[key]!==undefined)p[key]=Number(edit[key])
      }
      if(edit.net_after_discount!==undefined)p.sales=Number(edit.net_after_discount)
      if(edit.deposit_amount!==undefined)p.collections=Number(edit.deposit_amount)
      if(Object.keys(p).length===0)continue
      const {data:updated,error}=await admin.from('sales_rep_daily').update(p).eq('id',id).eq('batch_id',batchId).eq('branch_id',branchId).select('business_date').maybeSingle()
      if(error)throw new Error('تعديل بيانات المندوب: '+error.message)
      if(updated?.business_date)affectedDates.add(updated.business_date)
    }

    if(cashDeletes.length){
      const {data:deleted,error:lookupErr}=await admin.from('cash_entries').select('id,entry_date').in('id',cashDeletes).eq('batch_id',batchId).eq('branch_id',branchId)
      if(lookupErr)throw new Error('تحميل حركات الخزينة المراد حذفها: '+lookupErr.message)
      ;(deleted??[]).forEach((r:any)=>{if(r.entry_date)affectedDates.add(r.entry_date)})
      const {error:deleteErr}=await admin.from('cash_entries').delete().in('id',cashDeletes).eq('batch_id',batchId).eq('branch_id',branchId)
      if(deleteErr)throw new Error('حذف حركات الخزينة: '+deleteErr.message)
    }

    for(const edit of cashEdits){
      const id=Number(edit?.id);if(!Number.isInteger(id)||id<=0)continue
      const {data:before,error:beforeErr}=await admin.from('cash_entries').select('entry_date').eq('id',id).eq('batch_id',batchId).eq('branch_id',branchId).maybeSingle()
      if(beforeErr)throw new Error('تحميل تاريخ حركة الخزينة قبل التعديل: '+beforeErr.message)
      if(before?.entry_date)affectedDates.add(before.entry_date)
      const p:Record<string,unknown>={}
      if(edit.entry_date!==undefined)p.entry_date=String(edit.entry_date)
      if(edit.description!==undefined)p.description=String(edit.description||'').trim()||null
      if(edit.category!==undefined)p.category=String(edit.category||'').trim()||null
      if(edit.canonical_category!==undefined)p.canonical_category=String(edit.canonical_category||'').trim()||null
      if(edit.expense_group!==undefined)p.expense_group=edit.expense_group?String(edit.expense_group).trim():null
      if(edit.amount!==undefined)p.amount=Number(edit.amount)
      if(edit.direction!==undefined)p.direction=edit.direction==='in'?'in':'out'
      if(edit.is_expense!==undefined)p.is_expense=Boolean(edit.is_expense)
      if(edit.destination_id!==undefined)p.destination_id=edit.destination_id||null
      if(Object.keys(p).length===0)continue
      const {data:updated,error}=await admin.from('cash_entries').update(p).eq('id',id).eq('batch_id',batchId).eq('branch_id',branchId).select('entry_date').maybeSingle()
      if(error)throw new Error('تعديل حركة الخزينة: '+error.message)
      if(updated?.entry_date)affectedDates.add(updated.entry_date)
    }

    if(cashNew.length){
      const inserts=cashNew.map((entry:any)=>({
        batch_id:batchId,branch_id:branchId,entry_date:String(entry.entry_date||''),
        description:String(entry.description||'').trim()||null,
        amount:Number(entry.amount||0),
        direction:entry.direction==='in'?'in':'out',
        canonical_category:String(entry.canonical_category||entry.category||'أخرى').trim(),
        category:String(entry.category||entry.canonical_category||'أخرى').trim(),
        expense_group:entry.expense_group||null,
        is_expense:Boolean(entry.is_expense),
        destination_id:entry.destination_id||null,
        entry_kind:entry.is_expense?'expense':entry.direction==='in'?'collection':'other'
      }))
      const {data:inserted,error:insertErr}=await admin.from('cash_entries').insert(inserts).select('entry_date')
      if(insertErr)throw new Error('إضافة حركات الخزينة الجديدة: '+insertErr.message)
      ;(inserted??[]).forEach((r:any)=>{if(r.entry_date)affectedDates.add(r.entry_date)})
    }

    for(const edit of warehouseEdits){
      const id=Number(edit?.id);if(!Number.isInteger(id)||id<=0)continue
      const p:Record<string,unknown>={}
      for(const key of ['opening_qty','opening_value','incoming_factory_qty','incoming_factory_value','incoming_branches_qty','incoming_branches_value','sales_qty','sales_value','bonus_qty','bonus_value','gifts_qty','gifts_value','damages_qty','damages_value','return_factory_qty','return_factory_value','outgoing_branches_qty','outgoing_branches_value','adjustment_qty','adjustment_value','closing_qty','closing_value']){
        if(edit[key]!==undefined)p[key]=Number(edit[key])
      }
      if(Object.keys(p).length===0)continue
      const {data:updated,error}=await admin.from('warehouse_daily_summary').update(p).eq('id',id).eq('batch_id',batchId).eq('branch_id',branchId).select('business_date').maybeSingle()
      if(error)throw new Error('تعديل ملخص المخزون: '+error.message)
      if(updated?.business_date)affectedDates.add(updated.business_date)
    }

    for(const date of affectedDates){
      const [{data:reps,error:repsErr},{data:cash,error:cashErr},{data:wh,error:whErr}]=await Promise.all([
        admin.from('sales_rep_daily').select('sales_before_discount,net_after_discount,discounts,deposit_amount,opening_balance,closing_balance').eq('batch_id',batchId).eq('branch_id',branchId).eq('business_date',date),
        admin.from('cash_entries').select('amount,direction,is_expense,running_balance,id').eq('batch_id',batchId).eq('branch_id',branchId).eq('entry_date',date).order('id',{ascending:true}),
        admin.from('warehouse_daily_summary').select('closing_value,return_factory_value,bonus_value,gifts_value,damages_value').eq('batch_id',batchId).eq('branch_id',branchId).eq('business_date',date).maybeSingle()
      ])
      const err=repsErr||cashErr||whErr
      if(err)throw new Error('إعادة حساب اليوم '+date+': '+err.message)

      const gross=(reps??[]).reduce((s:number,r:any)=>s+Number(r.sales_before_discount||0),0)
      const net=(reps??[]).reduce((s:number,r:any)=>s+Number(r.net_after_discount||0),0)
      const discounts=(reps??[]).reduce((s:number,r:any)=>s+Number(r.discounts||0),0)
      const collections=(reps??[]).reduce((s:number,r:any)=>s+Number(r.deposit_amount||0),0)
      const opening=(reps??[]).reduce((s:number,r:any)=>s+Number(r.opening_balance||0),0)
      const closing=(reps??[]).reduce((s:number,r:any)=>s+Number(r.closing_balance||0),0)
      const cashIn=(cash??[]).filter((r:any)=>r.direction==='in').reduce((s:number,r:any)=>s+Number(r.amount||0),0)
      const cashOut=(cash??[]).filter((r:any)=>r.direction==='out').reduce((s:number,r:any)=>s+Number(r.amount||0),0)
      const expenses=(cash??[]).filter((r:any)=>r.is_expense).reduce((s:number,r:any)=>s+Number(r.amount||0),0)
      const closingCash=[...(cash??[])].reverse().find((r:any)=>r.running_balance!==null)?.running_balance??0

      const metrics={
        gross_sales:gross,net_sales:net,discounts,collections,
        opening_receivables:opening,closing_receivables:closing,
        cash_in:cashIn,cash_out:cashOut,expenses,closing_cash:Number(closingCash||0),
        inventory_value:Number(wh?.closing_value||0),
        returns_value:Number(wh?.return_factory_value||0),
        bonuses_value:Number(wh?.bonus_value||0),
        gifts_value:Number(wh?.gifts_value||0),
        damages_value:Number(wh?.damages_value||0)
      }

      const {data:metricsRows,error:metricsErr}=await admin.from('branch_daily_metrics').update(metrics).eq('batch_id',batchId).eq('branch_id',branchId).eq('business_date',date).select('id')
      if(metricsErr)throw new Error('تحديث مؤشرات اليوم '+date+': '+metricsErr.message)
      if(!metricsRows?.length)throw new Error('لم يتم العثور على سجل مؤشرات الفرع ليوم '+date)
    }

    return json({ok:true,affectedDates:[...affectedDates],affectedDatesCount:affectedDates.size})
  }catch(e){
    return json({error:e instanceof Error?e.message:String(e),partialSavePossible:true},500)
  }
})
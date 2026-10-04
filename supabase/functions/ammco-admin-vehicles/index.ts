import { createClient } from 'npm:@supabase/supabase-js@2.117.2'

const cors={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'GET, POST, OPTIONS'
}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}})

function normalizeVehicleLabel(v:string){
  const ar='٠١٢٣٤٥٦٧٨٩',en='0123456789'
  return String(v||'').trim().replace(/[٠-٩]/g,(d)=>en[ar.indexOf(d)]).replace(/\s+/g,' ').toLowerCase()
}

function monthBounds(month:string){
  if(!/^\d{4}-\d{2}$/.test(month)) return null
  const [y,m]=month.split('-').map(Number)
  const last=new Date(Date.UTC(y,m,0)).getUTCDate()
  return {from:`${month}-01`,to:`${month}-${String(last).padStart(2,'0')}`}
}

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:cors})
  if(!['GET','POST'].includes(req.method)) return json({error:'Method not allowed'},405)

  const authHeader=req.headers.get('Authorization')??''
  if(!authHeader.startsWith('Bearer ')) return json({error:'غير مصرح'},401)

  const url=Deno.env.get('SUPABASE_URL')!
  const publishable=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')!)['default']
  const secret=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')!)['default']
  const userClient=createClient(url,publishable,{global:{headers:{Authorization:authHeader}},auth:{persistSession:false,autoRefreshToken:false}})
  const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})

  const {data:u}=await userClient.auth.getUser()
  const uid=u?.user?.id
  if(!uid) return json({error:'غير مصرح'},401)
  const {data:me}=await admin.from('profiles').select('organization_id,role,is_active').eq('user_id',uid).maybeSingle()
  if(!me?.is_active) return json({error:'الحساب غير نشط'},403)

  if(req.method==='GET'){
    const q=new URL(req.url).searchParams
    const branchId=q.get('branch_id')||''
    let query=admin.from('vehicle_daily')
      .select('id,branch_id,vehicle_label,rep_name,business_date,raw_payload')
      .contains('raw_payload',{manual_assignment:true})
      .order('id',{ascending:false})
    if(branchId) query=query.eq('branch_id',branchId)
    const {data,error}=await query.limit(500)
    if(error) return json({error:error.message},500)
    const seen=new Set<string>(),mappings=[]
    for(const row of data||[]){
      const k=`${row.branch_id}|${String(row.vehicle_label||'').trim()}`
      if(!row.vehicle_label||seen.has(k)) continue
      seen.add(k);mappings.push(row)
    }
    return json({mappings})
  }

  if(me.role!=='admin') return json({error:'صلاحية المدير مطلوبة'},403)
  const body=await req.json().catch(()=>({}))
  const action=String(body?.action||'')
  const branchId=String(body?.branch_id||'')
  const month=String(body?.month||'')
  const bounds=monthBounds(month)

  if(action==='import_global'){
    if(!bounds) return json({error:'الشهر مطلوب'},400)
    const rows=Array.isArray(body?.rows)?body.rows:[]
    const reportType=String(body?.report_type||'petro_up_non_cash').trim()
    if(!rows.length) return json({error:'لا توجد صفوف قابلة للاستيراد'},400)

    const {data:orgBranches,error:orgErr}=await admin.from('branches')
      .select('id,name')
      .eq('organization_id',me.organization_id)
      .eq('is_active',true)
    if(orgErr)return json({error:orgErr.message},500)
    const branchIds=(orgBranches||[]).map((x:any)=>x.id)
    if(!branchIds.length)return json({error:'لا توجد فروع نشطة'},400)

    const {data:maps,error:mapErr}=await admin.from('vehicle_daily')
      .select('id,branch_id,vehicle_label,rep_name,raw_payload')
      .in('branch_id',branchIds)
      .contains('raw_payload',{manual_assignment:true})
      .order('id',{ascending:false})
    if(mapErr)return json({error:mapErr.message},500)

    const vehicleMap=new Map<string,{branch_id:string,rep_name:string}>()
    for(const x of maps||[]){
      const key=normalizeVehicleLabel(String(x.vehicle_label||''))
      if(key&&!vehicleMap.has(key)&&x.rep_name)vehicleMap.set(key,{branch_id:x.branch_id,rep_name:String(x.rep_name)})
    }

    const mapped:any[]=[]
    const unassigned=new Set<string>()
    for(const r of rows){
      const d=String(r.business_date||'')
      const vehicle=String(r.vehicle_label||'').trim()
      if(!vehicle||d<bounds.from||d>bounds.to)continue
      const hit=vehicleMap.get(normalizeVehicleLabel(vehicle))
      if(!hit){unassigned.add(vehicle);continue}
      mapped.push({...r,__branch_id:hit.branch_id,__rep_name:hit.rep_name})
    }
    if(!mapped.length)return json({error:'لم يتم العثور على سيارات مربوطة بفروع لهذا التقرير',unassigned:[...unassigned]},400)

    const mappedBranchIds=[...new Set(mapped.map((x:any)=>x.__branch_id))]
    const {data:batches,error:batchErr}=await admin.from('import_batches')
      .select('id,branch_id,version')
      .in('branch_id',mappedBranchIds)
      .eq('status','approved')
      .lte('period_start',bounds.to)
      .gte('period_end',bounds.from)
      .order('version',{ascending:false})
    if(batchErr)return json({error:batchErr.message},500)
    const batchByBranch=new Map<string,string>()
    for(const b of batches||[])if(!batchByBranch.has(b.branch_id))batchByBranch.set(b.branch_id,b.id)

    const clean:any[]=[]
    const missingBatch=new Set<string>()
    for(const r of mapped){
      const batchId=batchByBranch.get(r.__branch_id)
      if(!batchId){missingBatch.add(r.__branch_id);continue}
      const fuel=Math.max(0,Number(r.fuel_expense||0))
      const maint=Math.max(0,Number(r.maintenance_expense||0))
      const other=Math.max(0,Number(r.other_expense||0))
      clean.push({
        batch_id:batchId,branch_id:r.__branch_id,business_date:String(r.business_date),
        vehicle_label:String(r.vehicle_label||'').trim(),
        driver_name:String(r.driver_name||'').trim()||null,
        rep_name:r.__rep_name,
        sales:Number(r.sales||0),
        fuel_expense:fuel,maintenance_expense:maint,other_expense:other,total_expense:fuel+maint+other,
        opening_odometer:r.opening_odometer==null?null:Number(r.opening_odometer),
        closing_odometer:r.closing_odometer==null?null:Number(r.closing_odometer),
        raw_payload:{
          source:'petro_up_non_cash',
          report_type:reportType,
          non_cash:true,
          expense_category:'بترو أب',
          uploaded_by:uid,
          uploaded_at:new Date().toISOString(),
          fuel_liters:Number(r.fuel_liters||0),
          fuel_price:Number(r.fuel_price||0),
          invoice_no:String(r.invoice_no||'').trim()||null,
          station:String(r.station||'').trim()||null,
          payment_method:String(r.payment_method||'').trim()||null
        }
      })
    }
    if(!clean.length)return json({error:'لا توجد حركات قابلة للحفظ بعد مطابقة الفروع والشهر',unassigned:[...unassigned],missing_batch_branches:[...missingBatch]},400)

    const touched=[...new Set(clean.map((x:any)=>x.batch_id+'|'+x.branch_id))]
    for(const key of touched){
      const [batchId,bid]=key.split('|')
      const vehicles=[...new Set(clean.filter((x:any)=>x.batch_id===batchId&&x.branch_id===bid).map((x:any)=>x.vehicle_label))]
      const {data:old}=await admin.from('vehicle_daily')
        .select('id,raw_payload')
        .eq('batch_id',batchId).eq('branch_id',bid)
        .gte('business_date',bounds.from).lte('business_date',bounds.to)
        .in('vehicle_label',vehicles)
      const deleteIds=(old||[]).filter((x:any)=>x.raw_payload?.source==='petro_up_non_cash').map((x:any)=>x.id)
      if(deleteIds.length)await admin.from('vehicle_daily').delete().in('id',deleteIds)
    }

    const {error:insertErr}=await admin.from('vehicle_daily').insert(clean)
    if(insertErr)return json({error:insertErr.message},500)

    const branchNames=new Map((orgBranches||[]).map((x:any)=>[x.id,x.name]))
    const distribution:any[]=[]
    for(const bid of mappedBranchIds){
      const count=clean.filter((x:any)=>x.branch_id===bid).length
      if(count)distribution.push({branch_id:bid,branch_name:branchNames.get(bid)||bid,rows:count})
    }
    return json({ok:true,inserted:clean.length,distribution,unassigned:[...unassigned],missing_batch_branches:[...missingBatch]})
  }

  if(!branchId||!bounds) return json({error:'الفرع والشهر مطلوبان'},400)

  const {data:batch,error:batchError}=await admin.from('import_batches')
    .select('id')
    .eq('branch_id',branchId)
    .eq('status','approved')
    .lte('period_start',bounds.to)
    .gte('period_end',bounds.from)
    .order('version',{ascending:false})
    .limit(1)
    .maybeSingle()
  if(batchError) return json({error:batchError.message},500)
  if(!batch?.id) return json({error:'لا توجد دفعة معتمدة لهذا الفرع والشهر'},400)

  if(action==='assign'){
    const vehicleLabel=String(body?.vehicle_label||'').trim()
    const repName=String(body?.rep_name||'').trim()
    if(!vehicleLabel||!repName) return json({error:'السيارة والمندوب مطلوبان'},400)

    const {data:existing}=await admin.from('vehicle_daily')
      .select('id,raw_payload')
      .eq('branch_id',branchId)
      .eq('vehicle_label',vehicleLabel)
      .contains('raw_payload',{manual_assignment:true})
    const ids=(existing||[]).map((x:any)=>x.id)
    if(ids.length) await admin.from('vehicle_daily').delete().in('id',ids)

    const {error}=await admin.from('vehicle_daily').insert({
      batch_id:batch.id,
      branch_id:branchId,
      business_date:bounds.from,
      vehicle_label:vehicleLabel,
      rep_name:repName,
      sales:0,fuel_expense:0,maintenance_expense:0,other_expense:0,total_expense:0,
      raw_payload:{manual_assignment:true,assigned_by:uid,assigned_at:new Date().toISOString()}
    })
    if(error) return json({error:error.message},500)
    return json({ok:true})
  }

  if(action==='import'){
    const rows=Array.isArray(body?.rows)?body.rows:[]
    const reportType=String(body?.report_type||'vehicle').trim()
    if(!rows.length) return json({error:'لا توجد صفوف سيارة قابلة للاستيراد'},400)

    const {data:maps}=await admin.from('vehicle_daily')
      .select('vehicle_label,rep_name,id')
      .eq('branch_id',branchId)
      .contains('raw_payload',{manual_assignment:true})
      .order('id',{ascending:false})
    const map=new Map<string,string>()
    for(const x of maps||[]){
      const raw=String(x.vehicle_label||'').trim()
      const k=normalizeVehicleLabel(raw)
      if(k&&!map.has(k)&&x.rep_name) map.set(k,String(x.rep_name))
    }

    const clean=rows.flatMap((r:any)=>{
      const d=String(r.business_date||'')
      const vehicle=String(r.vehicle_label||'').trim()
      if(!vehicle||d<bounds.from||d>bounds.to) return []
      const fuel=Math.max(0,Number(r.fuel_expense||0))
      const maint=Math.max(0,Number(r.maintenance_expense||0))
      const other=Math.max(0,Number(r.other_expense||0))
      return [{
        batch_id:batch.id,branch_id:branchId,business_date:d,vehicle_label:vehicle,
        driver_name:String(r.driver_name||'').trim()||null,
        rep_name:map.get(normalizeVehicleLabel(vehicle))||null,
        sales:Number(r.sales||0),
        fuel_expense:fuel,maintenance_expense:maint,other_expense:other,
        total_expense:fuel+maint+other,
        opening_odometer:r.opening_odometer==null?null:Number(r.opening_odometer),
        closing_odometer:r.closing_odometer==null?null:Number(r.closing_odometer),
        raw_payload:{
          source:reportType==='petro_up_non_cash'?'petro_up_non_cash':'manual_vehicle_report_upload',
          report_type:reportType,
          non_cash:reportType==='petro_up_non_cash',
          expense_category:reportType==='petro_up_non_cash'?'بترو أب':null,
          uploaded_by:uid,
          uploaded_at:new Date().toISOString(),
          fuel_liters:Number(r.fuel_liters||0),
          fuel_price:Number(r.fuel_price||0),
          invoice_no:String(r.invoice_no||'').trim()||null,
          station:String(r.station||'').trim()||null,
          payment_method:String(r.payment_method||'').trim()||null
        }
      }]
    })
    if(!clean.length) return json({error:'لا توجد صفوف داخل الشهر المحدد'},400)

    const vehicles=[...new Set(clean.map((x:any)=>x.vehicle_label))]
    const {data:old}=await admin.from('vehicle_daily')
      .select('id,vehicle_label,business_date,raw_payload')
      .eq('batch_id',batch.id)
      .gte('business_date',bounds.from).lte('business_date',bounds.to)
      .in('vehicle_label',vehicles)
    const deleteIds=(old||[]).filter((x:any)=>!x.raw_payload?.manual_assignment).map((x:any)=>x.id)
    if(deleteIds.length) await admin.from('vehicle_daily').delete().in('id',deleteIds)

    const {error}=await admin.from('vehicle_daily').insert(clean)
    if(error) return json({error:error.message},500)
    return json({ok:true,inserted:clean.length,unassigned:[...new Set(clean.filter((x:any)=>!x.rep_name).map((x:any)=>x.vehicle_label))]})
  }

  return json({error:'إجراء غير معروف'},400)
})

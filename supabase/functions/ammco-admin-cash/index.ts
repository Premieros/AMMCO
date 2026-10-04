import { createClient } from 'npm:@supabase/supabase-js@2.117.2'

const cors={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'GET, POST, OPTIONS'
}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}})

const normalize=(v:string)=>v.replace(/\s+/g,' ').replace(/أ|إ|آ/g,'ا').replace(/ة/g,'ه').trim()
function classify(code:string|null,category:string|null,description:string|null){
  const c=normalize(category||''),d=normalize(description||''),raw=(code||'').trim()
  if(/^303\d+/.test(raw)) return {entry_kind:'expense',canonical_category:category||null,expense_group:'مصروفات اخرى',is_expense:true,classification_confidence:'exact'}
  if(c==='توريد') return {entry_kind:'collection',canonical_category:'توريد مندوب',expense_group:null,is_expense:false,classification_confidence:'exact'}
  if(/ايداع/.test(c)||/ايداع/.test(d)||/qnb|cib/i.test((category||'')+' '+(description||''))) return {entry_kind:'bank_deposit',canonical_category:category||description||'ايداع بنكي',expense_group:null,is_expense:false,classification_confidence:'inferred'}
  if((/تحويل/.test(c)&&/مصنع/.test(c))||(/تحويل/.test(d)&&/مصنع/.test(d))||c==='دائنون') return {entry_kind:'hq_transfer',canonical_category:category||description||'تحويل للمصنع',expense_group:null,is_expense:false,classification_confidence:'inferred'}
  return {entry_kind:'other',canonical_category:category||null,expense_group:null,is_expense:false,classification_confidence:'unclassified'}
}
function money(v:unknown,label:string){
  const n=Number(v)
  if(!Number.isFinite(n)||n<0) throw new Error(label+' غير صالح')
  return n
}
function validDate(v:string){return /^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T00:00:00Z'))}

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors})
  if(!['GET','POST'].includes(req.method))return json({error:'Method not allowed'},405)

  const authHeader=req.headers.get('Authorization')??''
  if(!authHeader.startsWith('Bearer '))return json({error:'غير مصرح'},401)
  const url=Deno.env.get('SUPABASE_URL')!
  const publishable=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')!)[ 'default' ]
  const secret=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')!)[ 'default' ]
  const userClient=createClient(url,publishable,{global:{headers:{Authorization:authHeader}},auth:{persistSession:false,autoRefreshToken:false}})
  const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:u}=await userClient.auth.getUser();const uid=u?.user?.id
  if(!uid)return json({error:'غير مصرح'},401)
  const {data:me}=await admin.from('profiles').select('organization_id,role,is_active').eq('user_id',uid).maybeSingle()
  if(!me?.is_active||me.role!=='admin')return json({error:'هذه الصفحة للمدير فقط'},403)

  if(req.method==='GET'){
    const parsed=new URL(req.url)
    const branch=parsed.searchParams.get('branch')||''
    const from=parsed.searchParams.get('from')||''
    const to=parsed.searchParams.get('to')||''
    let entryQ=admin.from('cash_entries')
      .select('id,batch_id,branch_id,entry_date,direction,category,description,amount,running_balance,source_row,source_code,raw_payload')
      .order('entry_date',{ascending:false}).order('id',{ascending:false}).limit(5000)
    if(branch)entryQ=entryQ.eq('branch_id',branch)
    if(from)entryQ=entryQ.gte('entry_date',from)
    if(to)entryQ=entryQ.lte('entry_date',to)
    const [{data:entries,error:eErr},{data:branches,error:bErr}]=await Promise.all([
      entryQ,
      admin.from('branches').select('id,name,code').eq('organization_id',me.organization_id).eq('is_active',true).order('name')
    ])
    const err=eErr||bErr
    if(err)return json({error:err.message},500)
    return json({entries:entries??[],branches:branches??[]})
  }

  try{
    const body=await req.json()
    const id=Number(body?.id)
    const source_code=String(body?.source_code??'').trim()||null
    const entry_date=String(body?.entry_date??'').trim()
    const description=String(body?.description??'').trim()||null
    const category=String(body?.category??'').trim()||null
    const inbound=money(body?.inbound??0,'الوارد')
    const outbound=money(body?.outbound??0,'الصادر')
    const runningRaw=String(body?.running_balance??'').trim()
    const running_balance=runningRaw===''?null:Number(runningRaw)
    const reason=String(body?.reason??'').trim()||'تعديل من شاشة الخزينة'
    if(!Number.isInteger(id)||id<=0)return json({error:'رقم الحركة غير صالح'},400)
    if(!validDate(entry_date))return json({error:'التاريخ غير صالح'},400)
    if(inbound>0&&outbound>0)return json({error:'لا يمكن إدخال وارد وصادر في نفس الحركة'},400)
    if(inbound===0&&outbound===0)return json({error:'أدخل قيمة في الوارد أو الصادر'},400)
    if(running_balance!==null&&!Number.isFinite(running_balance))return json({error:'رصيد آخر غير صالح'},400)

    const {data:old,error:oldErr}=await admin.from('cash_entries').select('*').eq('id',id).maybeSingle()
    if(oldErr||!old)return json({error:oldErr?.message||'الحركة غير موجودة'},404)

    const amount=inbound>0?inbound:outbound
    const direction=inbound>0?'in':'out'
    const cl=classify(source_code,category,description)
    const changedAt=new Date().toISOString()
    const previousPayload=(old.raw_payload&&typeof old.raw_payload==='object')?old.raw_payload:{}
    const history=Array.isArray((previousPayload as any).manual_edits)?(previousPayload as any).manual_edits:[]
    const raw_payload={
      ...previousPayload,
      manual_edits:[...history,{
        at:changedAt,by:uid,reason,
        before:{source_code:old.source_code,entry_date:old.entry_date,description:old.description,category:old.category,direction:old.direction,amount:old.amount,running_balance:old.running_balance},
        after:{source_code,entry_date,description,category,direction,amount,running_balance}
      }]
    }

    const {data:updated,error:uErr}=await admin.from('cash_entries').update({
      source_code,account_code:source_code,entry_date,description,category,direction,amount,running_balance,
      entry_kind:cl.entry_kind,canonical_category:cl.canonical_category,expense_group:cl.expense_group,
      is_expense:cl.is_expense,classification_confidence:cl.classification_confidence,raw_payload
    }).eq('id',id).select('id,branch_id,entry_date,source_code,description,category,direction,amount,running_balance').single()
    if(uErr)return json({error:uErr.message},500)

    await admin.from('cash_entry_correction_log').insert({
      cash_entry_id:id,branch_id:old.branch_id,
      old_canonical_category:old.canonical_category,new_canonical_category:cl.canonical_category,
      old_expense_group:old.expense_group,new_expense_group:cl.expense_group,
      old_description:old.description,new_description:description,
      old_is_expense:old.is_expense,new_is_expense:cl.is_expense,
      old_entry_kind:old.entry_kind,new_entry_kind:cl.entry_kind,
      reason,changed_by:uid
    })

    for(const date of [...new Set([String(old.entry_date||''),entry_date])].filter(Boolean)){
      const {data:cash}=await admin.from('cash_entries').select('amount,direction,is_expense,running_balance,id')
        .eq('branch_id',old.branch_id).eq('entry_date',date).order('id',{ascending:true})
      const cashIn=(cash??[]).filter((x:any)=>x.direction==='in').reduce((s:number,x:any)=>s+Number(x.amount||0),0)
      const cashOut=(cash??[]).filter((x:any)=>x.direction==='out').reduce((s:number,x:any)=>s+Number(x.amount||0),0)
      const expenses=(cash??[]).filter((x:any)=>x.is_expense).reduce((s:number,x:any)=>s+Number(x.amount||0),0)
      const closing=[...(cash??[])].reverse().find((x:any)=>x.running_balance!==null)?.running_balance??0
      await admin.from('branch_daily_metrics').update({cash_in:cashIn,cash_out:cashOut,expenses,closing_cash:Number(closing||0)})
        .eq('branch_id',old.branch_id).eq('business_date',date)
    }

    return json({ok:true,entry:updated})
  }catch(e){return json({error:e instanceof Error?e.message:String(e)},400)}
})

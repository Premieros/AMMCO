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
  const {data:me}=await admin.from('profiles').select('organization_id,role,is_active').eq('user_id',uid).maybeSingle()
  if(!me?.is_active||me.role!=='admin')return json({error:'صلاحية المدير مطلوبة لحذف الشيتات'},403)

  const body=await req.json().catch(()=>({}))
  const batchId=String(body?.batchId??'')
  if(!/^[0-9a-f-]{36}$/i.test(batchId))return json({error:'معرف الشيت غير صالح'},400)

  const {data:batch,error:batchError}=await admin.from('import_batches')
    .select('id,organization_id,branch_id,period_start,period_end,status,storage_path,version')
    .eq('id',batchId).maybeSingle()
  if(batchError)return json({error:batchError.message},500)
  if(!batch)return json({error:'الشيت غير موجود'},404)
  if(batch.organization_id!==me.organization_id)return json({error:'لا توجد صلاحية لهذا الشيت'},403)

  try{
    await admin.from('branch_day_submissions').delete().eq('current_batch_id',batchId)
    await admin.from('import_day_changes').delete().eq('previous_batch_id',batchId)
    await admin.from('import_day_changes').delete().eq('batch_id',batchId)
    await admin.from('import_batches').update({replaces_batch_id:null}).eq('replaces_batch_id',batchId)

    const {error:delError}=await admin.from('import_batches').delete().eq('id',batchId)
    if(delError)throw delError

    if(batch.storage_path){
      await admin.storage.from('branch-workbooks').remove([batch.storage_path, batch.storage_path+'.parsed.json'])
    }

    let restoredBatchId:null|string=null
    if(batch.status==='approved'){
      const {data:prev}=await admin.from('import_batches').select('id')
        .eq('branch_id',batch.branch_id)
        .eq('period_start',batch.period_start)
        .eq('status','superseded')
        .order('version',{ascending:false})
        .limit(1).maybeSingle()
      if(prev?.id){
        const {error:restoreError}=await admin.from('import_batches').update({status:'approved'}).eq('id',prev.id)
        if(!restoreError)restoredBatchId=prev.id
      }
    }

    return json({ok:true,restoredBatchId})
  }catch(e){
    return json({error:e instanceof Error?e.message:String(e)},500)
  }
})

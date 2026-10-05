
import { createClient } from 'npm:@supabase/supabase-js@2.117.2'

const cors={
 'Access-Control-Allow-Origin':'*',
 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
 'Access-Control-Allow-Methods':'GET, POST, OPTIONS'
}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}})

Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors})
 const authHeader=req.headers.get('Authorization')??''
 if(!authHeader.startsWith('Bearer '))return json({error:'غير مصرح'},401)

 const url=Deno.env.get('SUPABASE_URL')!
 const publishable=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')!)[ 'default' ]
 const secret=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')!)[ 'default' ]
 const userClient=createClient(url,publishable,{global:{headers:{Authorization:authHeader}},auth:{persistSession:false,autoRefreshToken:false}})
 const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})

 const {data:userData}=await userClient.auth.getUser()
 const userId=userData?.user?.id
 if(!userId)return json({error:'غير مصرح'},401)
 const {data:me}=await admin.from('profiles').select('organization_id,role,is_active').eq('user_id',userId).maybeSingle()
 if(!me?.is_active||me.role!=='admin')return json({error:'هذه الصفحة للمدير فقط'},403)

 if(req.method==='GET'){
   const [{data:profiles,error:pErr},{data:access,error:aErr},{data:branches,error:bErr},{data:authUsers,error:uErr}]=await Promise.all([
     admin.from('profiles').select('user_id,full_name,role,is_active,created_at').eq('organization_id',me.organization_id).order('created_at'),
     admin.from('user_branch_access').select('user_id,branch_id'),
     admin.from('branches').select('id,name,code,is_active').eq('organization_id',me.organization_id).order('name'),
     admin.auth.admin.listUsers({page:1,perPage:1000})
   ])
   if(pErr||aErr||bErr||uErr)return json({error:pErr?.message||aErr?.message||bErr?.message||uErr?.message},500)
   const authMap=new Map((authUsers?.users??[]).map(u=>[u.id,u]))
   const users=(profiles??[]).map(p=>({
     ...p,
     email:authMap.get(p.user_id)?.email??'',
     last_sign_in_at:authMap.get(p.user_id)?.last_sign_in_at??null,
     branch_ids:(access??[]).filter(a=>a.user_id===p.user_id).map(a=>a.branch_id)
   }))
   return json({users,branches})
 }

 if(req.method!=='POST')return json({error:'Method not allowed'},405)
 const body=await req.json().catch(()=>({}))
 const action=String(body.action??'')
 const validateBranchIds=async(ids:string[])=>{
   if(!ids.length)return [] as string[]
   const {data,error}=await admin.from('branches').select('id').eq('organization_id',me.organization_id).in('id',ids)
   if(error)throw error
   const valid=(data??[]).map((x:any)=>x.id as string)
   if(valid.length!==new Set(ids).size)throw new Error('بعض الفروع المحددة لا تتبع المؤسسة الحالية')
   return valid
 }

 if(action==='create'){
   const email=String(body.email??'').trim().toLowerCase()
   const password=String(body.password??'')
   const fullName=String(body.full_name??'').trim()
   const role=['admin','analyst','branch_user'].includes(body.role)?body.role:'branch_user'
   const requestedBranchIds=Array.isArray(body.branch_ids)?body.branch_ids.filter((x:unknown)=>typeof x==='string') as string[]:[]
   let branchIds:string[]=[]
   try{branchIds=await validateBranchIds(requestedBranchIds)}catch(e){return json({error:e instanceof Error?e.message:String(e)},400)}
   if(!email||password.length<8)return json({error:'البريد وكلمة مرور مؤقتة 8 أحرف على الأقل مطلوبان'},400)
   const {data:created,error:createErr}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:fullName}})
   if(createErr||!created.user)return json({error:createErr?.message||'تعذر إنشاء المستخدم'},400)
   const uid=created.user.id
   const {error:profileErr}=await admin.from('profiles').insert({user_id:uid,organization_id:me.organization_id,full_name:fullName||email,role,is_active:true})
   if(profileErr){await admin.auth.admin.deleteUser(uid);return json({error:profileErr.message},400)}
   if(role==='branch_user'&&branchIds.length){
     await admin.from('user_branch_access').insert(branchIds.map((branch_id:string)=>({user_id:uid,branch_id})))
   }
   return json({ok:true,user_id:uid})
 }

 if(action==='update'){
   const target=String(body.user_id??'')
   const role=['admin','analyst','branch_user'].includes(body.role)?body.role:'branch_user'
   const isActive=body.is_active!==false
   const fullName=String(body.full_name??'').trim()
   const requestedBranchIds=Array.isArray(body.branch_ids)?body.branch_ids.filter((x:unknown)=>typeof x==='string') as string[]:[]
   let branchIds:string[]=[]
   try{branchIds=await validateBranchIds(requestedBranchIds)}catch(e){return json({error:e instanceof Error?e.message:String(e)},400)}
   const {data:targetProfile}=await admin.from('profiles').select('organization_id').eq('user_id',target).maybeSingle()
   if(!targetProfile||targetProfile.organization_id!==me.organization_id)return json({error:'المستخدم غير موجود في المؤسسة'},404)
   if(target===userId && (!isActive||role!=='admin'))return json({error:'لا يمكن للمدير إلغاء صلاحية نفسه أو تغيير دوره من هنا'},400)
   const {error:updateErr}=await admin.from('profiles').update({full_name:fullName||null,role,is_active:isActive}).eq('user_id',target)
   if(updateErr)return json({error:updateErr.message},400)
   await admin.from('user_branch_access').delete().eq('user_id',target)
   if(role==='branch_user'&&branchIds.length){
     const {error:accessErr}=await admin.from('user_branch_access').insert(branchIds.map((branch_id:string)=>({user_id:target,branch_id})))
     if(accessErr)return json({error:accessErr.message},400)
   }
   return json({ok:true})
 }
 if(action==='reset_password'){
   const target=String(body.user_id??'')
   const password=String(body.password??'')
   if(password.length<8)return json({error:'كلمة المرور المؤقتة يجب ألا تقل عن 8 أحرف'},400)
   const {data:targetProfile}=await admin.from('profiles').select('organization_id').eq('user_id',target).maybeSingle()
   if(!targetProfile||targetProfile.organization_id!==me.organization_id)return json({error:'المستخدم غير موجود في المؤسسة'},404)
   const {error:pwErr}=await admin.auth.admin.updateUserById(target,{password})
   if(pwErr)return json({error:pwErr.message},400)
   return json({ok:true})
 }
 return json({error:'إجراء غير معروف'},400)
})

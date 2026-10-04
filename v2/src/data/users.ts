import {supabase} from '../lib/supabase'
const endpoint=()=>import.meta.env.VITE_SUPABASE_URL+'/functions/v1/ammco-admin-users'
async function call(method:string,body?:any){const {data:{session}}=await supabase.auth.getSession();if(!session)throw new Error('انتهت جلسة الدخول');const res=await fetch(endpoint(),{method,headers:{Authorization:'Bearer '+session.access_token,apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const out=await res.json();if(!res.ok)throw new Error(out.error||'تعذر تنفيذ العملية');return out}
export const getUsers=()=>call('GET')
export const createUser=(body:any)=>call('POST',{action:'create',...body})
export const updateUser=(body:any)=>call('POST',{action:'update',...body})

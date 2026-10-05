import {createClient} from '@supabase/supabase-js'
const url=import.meta.env.VITE_SUPABASE_URL as string
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string
if(!url||!key) throw new Error('Supabase environment is missing')
export const supabase=createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}})

export const isJwtExpiredError=(error:unknown)=>/jwt expired|token.*expired|invalid jwt/i.test(String((error as any)?.message||error||''))

export async function recoverSession(){
 const {data,error}=await supabase.auth.refreshSession()
 if(!error&&data.session)return data.session
 await supabase.auth.signOut({scope:'local'}).catch(()=>undefined)
 return null
}

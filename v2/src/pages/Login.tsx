import {FormEvent,useState} from 'react'
import {supabase} from '../lib/supabase'

export function Login(){
 const [error,setError]=useState('')
 const [busy,setBusy]=useState(false)
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setError('')
  const fd=new FormData(e.currentTarget)
  const {error}=await supabase.auth.signInWithPassword({email:String(fd.get('email')||''),password:String(fd.get('password')||'')})
  if(error)setError(error.message)
  setBusy(false)
 }
 return <main className="login-page"><form className="login-card" onSubmit={submit}>
  <div className="login-brand"><b>AMMCO</b><span>Management Intelligence</span></div>
  <label>البريد الإلكتروني<input name="email" type="email" autoComplete="username" required/></label>
  <label>كلمة المرور<input name="password" type="password" autoComplete="current-password" required/></label>
  {error&&<div className="error-box">{error}</div>}
  <button className="primary" disabled={busy}>{busy?'جاري الدخول…':'دخول'}</button>
 </form></main>
}

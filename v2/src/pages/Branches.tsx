import {FormEvent,useEffect,useState} from 'react'
import {supabase} from '../lib/supabase'
import {DataTable} from '../components/DataTable'

export function BranchesPage(){
 const [rows,setRows]=useState<any[]>([]),[msg,setMsg]=useState(''),[error,setError]=useState('')
 const load=async()=>{const {data,error}=await supabase.from('branches').select('id,name,code,is_active,created_at,treasury_accounts(id,is_active)').order('created_at');if(error)throw error;setRows(data||[])}
 useEffect(()=>{load().catch(e=>setError(e.message||String(e)))},[])
 async function add(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);try{setMsg('جاري إنشاء الفرع…');const {error}=await supabase.rpc('create_branch_with_default_treasury',{p_code:String(f.get('code')||'').trim(),p_name:String(f.get('name')||'').trim()});if(error)throw error;setMsg('تم إنشاء الفرع والخزنة الرئيسية');(e.currentTarget as HTMLFormElement).reset();await load()}catch(x:any){setMsg(x.message||String(x))}}
 return <div>{error&&<div className="error-box">{error}</div>}<section className="panel"><h2>إضافة فرع جديد</h2><form className="user-form" onSubmit={add}><input name="name" placeholder="اسم الفرع" required/><input name="code" placeholder="كود الفرع" dir="ltr" required/><button className="primary">إنشاء الفرع</button></form>{msg&&<p className="muted">{msg}</p>}</section><DataTable title="الفروع الحالية" rows={rows.map(b=>({...b,status:b.is_active?'نشط':'متوقف',treasuries:(b.treasury_accounts||[]).filter((x:any)=>x.is_active).length,created:new Date(b.created_at).toLocaleString('en-GB')}))} columns={[{key:'name',label:'الفرع'},{key:'code',label:'الكود'},{key:'status',label:'الحالة'},{key:'treasuries',label:'عدد الخزائن',numeric:true},{key:'created',label:'تاريخ الإنشاء'}]}/></div>
}

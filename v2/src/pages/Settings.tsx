export function Settings(){
 return <div><section className="panel"><h2>إعدادات النظام</h2><div className="settings-list"><p><b>مصدر البيانات:</b> AMMCO المعتمد فقط.</p><p><b>قاعدة الكمية المكافئة:</b> سعر الكرتونة 570 = ×2، وما عداه ×1.</p><p><b>سياسة التقارير:</b> One Number = One Source.</p><p><b>الاستيراد:</b> لا تدخل الدفعة في التقارير قبل الاعتماد.</p></div><button className="small-btn" onClick={()=>{localStorage.clear();location.reload()}}>مسح إعدادات المتصفح</button></section></div>
}

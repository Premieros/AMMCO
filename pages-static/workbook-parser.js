import * as XLSX from 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm'

const REQUIRED_SHEETS=['DATA','Total','تحليلي الفرع','توريدات','الخزنة','حركة المخزن','ملاحظات','الجرد']
const REP_COLUMNS=['J','L','N','P','R','T','V','X','Z','AB','AD','AF']
const REMIT_STARTS=[2,5,8,11,14,17,20,23,26,29,32,35]

const colLetters=(n)=>{let s='';while(n>0){const r=(n-1)%26;s=String.fromCharCode(65+r)+s;n=Math.floor((n-1)/26)}return s}
const addr=(row,col)=>`${colLetters(col)}${row}`
const value=(sheet,ref)=>{
  const c=sheet?.[ref]
  if(!c)return null
  if(c.f && c.v!==undefined)return c.v
  return c.v ?? null
}
const text=(sheet,ref)=>{
  const v=value(sheet,ref)
  if(v===null||v===undefined)return ''
  if(typeof v==='string')return v.trim()
  if(typeof v==='number')return v===0?'':String(v)
  if(v instanceof Date)return v.toISOString()
  return String(v).trim()
}
const num=(sheet,ref)=>{
  const v=value(sheet,ref)
  if(typeof v==='number'&&Number.isFinite(v))return v
  if(typeof v==='string'){const p=Number(v.replace(/,/g,'').trim());return Number.isFinite(p)?p:0}
  return 0
}
const nullableNum=(sheet,ref)=>{
  const v=value(sheet,ref)
  if(v===null||v===undefined||v==='')return null
  const n=num(sheet,ref);return Number.isFinite(n)?n:null
}
const isoDate=(sheet,ref)=>{
  const v=value(sheet,ref)
  if(v instanceof Date&&!Number.isNaN(v.getTime()))return v.toISOString().slice(0,10)
  if(typeof v==='number'){
    const p=XLSX.SSF.parse_date_code(v)
    if(p&&p.y&&p.m&&p.d)return `${String(p.y).padStart(4,'0')}-${String(p.m).padStart(2,'0')}-${String(p.d).padStart(2,'0')}`
  }
  if(typeof v==='string'){
    const d=new Date(v);if(!Number.isNaN(d.getTime()))return d.toISOString().slice(0,10)
  }
  return null
}
const dims=(sheet)=>{
  const range=XLSX.utils.decode_range(sheet?.['!ref']||'A1:A1')
  return {rows:Math.max(1,range.e.r+1),cols:Math.max(1,range.e.c+1)}
}
const normalizeCategory=v=>v.replace(/\s+/g,' ').replace(/أ|إ|آ/g,'ا').replace(/ة/g,'ه').trim()
const expenseGroupFor=category=>{
  if(!category)return null
  const c=normalizeCategory(category)
  if(/(سيارات|سولار|زيوت|غسيل|كارتات طريق|اطارات|كاوتش|قطع غيار|جراج|غرامات|تراخيص)/.test(c))return 'مصروفات السيارات'
  if(/(اجور|مرتبات|عمولات|حوافز|منح|مكافات|تامينات)/.test(c))return 'اجور وحوافز وعمولات'
  if(/(ايجارات|كهرباء|مياه|نظافه)/.test(c))return 'تشغيل ومرافق'
  if(/(نت|تليفون|ادوات كتابيه|مصاريف تحويل|اكراميات|تعتيق)/.test(c))return 'اداري ومالي'
  if(/(انتقالات|بدل سفر)/.test(c))return 'انتقالات وسفر'
  return 'مصروفات اخرى'
}
const classifyTreasury=(sourceCode,sourceCategory,description)=>{
  const code=(sourceCode||'').trim(),category=(sourceCategory||'').trim(),desc=(description||'').trim()
  const nc=normalizeCategory(category),nd=normalizeCategory(desc)
  if(/^303\d+/.test(code))return {entryKind:'expense',canonicalCategory:category||null,expenseGroup:expenseGroupFor(category),isExpense:true,classificationConfidence:'exact'}
  if(nc==='توريد')return {entryKind:'collection',canonicalCategory:'توريد مندوب',expenseGroup:null,isExpense:false,classificationConfidence:'exact'}
  if(/ايداع/.test(nc)||/\bqnb\b/i.test(category)||nc==='القاهره')return {entryKind:'bank_deposit',canonicalCategory:category||'ايداع بنكي',expenseGroup:null,isExpense:false,classificationConfidence:'exact'}
  if((/تحويل/.test(nc)&&/مصنع/.test(nc))||nc==='دائنون')return {entryKind:'hq_transfer',canonicalCategory:category||'تحويل للمصنع',expenseGroup:null,isExpense:false,classificationConfidence:'exact'}
  if(nc==='سلفه')return {entryKind:'advance',canonicalCategory:'سلفة',expenseGroup:null,isExpense:false,classificationConfidence:'exact'}
  if(nc==='عهده')return {entryKind:'custody',canonicalCategory:'عهدة',expenseGroup:null,isExpense:false,classificationConfidence:'exact'}
  if(/مستحقه فروع/.test(nc))return {entryKind:'interbranch',canonicalCategory:category||'مستحقات فروع',expenseGroup:null,isExpense:false,classificationConfidence:'exact'}
  if(/بخزنه الفرع/.test(nc))return {entryKind:'cash_balance',canonicalCategory:category||'بخزنة الفرع',expenseGroup:null,isExpense:false,classificationConfidence:'exact'}
  if(!category&&/مصروف تحويل/.test(nd))return {entryKind:'expense',canonicalCategory:'مصاريف تحويل',expenseGroup:'اداري ومالي',isExpense:true,classificationConfidence:'alias'}
  if(!category&&/تحويل نقدي.*مصنع/.test(nd))return {entryKind:'hq_transfer',canonicalCategory:'تحويل للمصنع',expenseGroup:null,isExpense:false,classificationConfidence:'inferred'}
  return {entryKind:'other',canonicalCategory:category||null,expenseGroup:null,isExpense:false,classificationConfidence:'unclassified'}
}
const dailyDate=(sheetName,periodStart)=>{
  if(!periodStart)return null
  const m=sheetName.trim().match(/^(\d{1,2})(-?)$/);if(!m)return null
  const day=Number(m[1]);if(day<1||day>31)return null
  const base=new Date(`${periodStart}T00:00:00Z`);if(Number.isNaN(base.getTime()))return null
  const month=m[2]?base.getUTCMonth()-1:base.getUTCMonth()
  const d=new Date(Date.UTC(base.getUTCFullYear(),month,day))
  return d.getUTCDate()===day?d.toISOString().slice(0,10):null
}

function extractProducts(sheet){
  const out=[],{rows}=dims(sheet)
  for(let row=4;row<=rows;row++){
    const base=text(sheet,`H${row}`);if(!base)continue
    const model=text(sheet,`I${row}`)||null,flavor=text(sheet,`J${row}`)||null,pc=text(sheet,`K${row}`)||null
    const barcode=text(sheet,`O${row}`)||null
    const name=text(sheet,`P${row}`)||[base,model,flavor,pc].filter(Boolean).join(' ')
    out.push({
      sourceProductKey:barcode??name.replace(/\s+/g,' ').trim().toLowerCase(),name,
      category:text(sheet,`G${row}`)||null,model,flavor,barcode,
      priceCategory:text(sheet,`S${row}`)||pc,
      packagingCount:nullableNum(sheet,`L${row}`),boxCount:nullableNum(sheet,`M${row}`),
      cartonDescriptor:text(sheet,`N${row}`)||null,
      retailCartonPrice:nullableNum(sheet,`A${row}`),retailPackPrice:nullableNum(sheet,`B${row}`),
      wholesaleCartonPrice:nullableNum(sheet,`D${row}`),wholesalePackPrice:nullableNum(sheet,`E${row}`),
      rawPayload:{row,barcode,base_name:base}
    })
  }
  return out
}
function extractRemittances(sheet){
  const out=[],{rows}=dims(sheet)
  REMIT_STARTS.forEach((start,index)=>{
    const rep=text(sheet,addr(2,start)).replace(/\s+/g,' ').trim();if(!rep)return
    const opening=num(sheet,addr(1,start))
    for(let row=6;row<=rows;row++){
      const d=isoDate(sheet,addr(row,1));if(!d)continue
      out.push({businessDate:d,repSlot:index+1,repName:rep,openingDebt:opening,
        salesAmount:num(sheet,addr(row,start)),depositAmount:num(sheet,addr(row,start+1)),closingDebt:num(sheet,addr(row,start+2)),
        sourceRow:row,rawPayload:{sales_cell:addr(row,start),deposit_cell:addr(row,start+1),debt_cell:addr(row,start+2)}})
    }
  })
  return out
}
function extractWarehouse(sheet){
  const out=[],{rows}=dims(sheet)
  for(let qr=3;qr<=rows;qr+=2){
    const vr=qr+1,d=isoDate(sheet,addr(qr,1));if(!d||vr>rows)continue
    const q=c=>num(sheet,addr(qr,c)),v=c=>num(sheet,addr(vr,c))
    out.push({businessDate:d,sourceQtyRow:qr,sourceValueRow:vr,
      openingQty:q(3),openingValue:v(3),incomingFactoryQty:q(4),incomingFactoryValue:v(4),
      incomingBranchesQty:q(5),incomingBranchesValue:v(5),salesQty:q(6),salesValue:v(6),
      bonusQty:q(7),bonusValue:v(7),giftsQty:q(8),giftsValue:v(8),damagesQty:q(9),damagesValue:v(9),
      returnFactoryQty:q(10),returnFactoryValue:v(10),outgoingBranchesQty:q(11),outgoingBranchesValue:v(11),
      adjustmentQty:q(12),adjustmentValue:v(12),closingQty:q(13),closingValue:v(13),
      rawPayload:{qty_row:qr,value_row:vr,source_sheet:'حركة المخزن'}})
  }return out
}
function extractCounts(sheet,countDate){
  if(!countDate)return []
  const out=[],{rows}=dims(sheet)
  const locs=[[9,'warehouse','م 1'],[10,'warehouse','م 2'],[11,'warehouse','م 3'],[12,'warehouse','م 4'],[13,'vehicle','سيارة 1'],[14,'vehicle','سيارة 2'],[15,'vehicle','سيارة 3'],[16,'vehicle','سيارة 4'],[17,'vehicle','سيارة 5']]
  for(let row=4;row<=rows;row++){
    const product=text(sheet,addr(row,2)).replace(/\s+/g,' ').trim();if(!product||product.replace(/أ|إ|آ/g,'ا')==='اجمالي')continue
    const unit=nullableNum(sheet,addr(row,3))
    out.push({countDate,productName:product,locationType:'branch_total',locationLabel:'إجمالي',
      bookQty:nullableNum(sheet,addr(row,4)),actualQty:nullableNum(sheet,addr(row,5)),
      varianceQty:nullableNum(sheet,addr(row,6)),unitValue:unit,varianceValue:nullableNum(sheet,addr(row,7)),rawPayload:{source_row:row}})
    for(const [col,type,label] of locs){
      const raw=value(sheet,addr(row,col));if(raw===null||raw===undefined||raw==='')continue
      out.push({countDate,productName:product,locationType:type,locationLabel:label,bookQty:null,actualQty:num(sheet,addr(row,col)),varianceQty:null,unitValue:unit,varianceValue:null,rawPayload:{source_row:row,source_cell:addr(row,col)}})
    }
  }return out
}
function extractTreasury(sheet,issues){
  const out=[],{rows}=dims(sheet)
  for(let row=3;row<=rows;row++){
    const inbound=nullableNum(sheet,addr(row,5))??0,outbound=nullableNum(sheet,addr(row,6))??0
    if(inbound===0&&outbound===0)continue
    const raw=value(sheet,addr(row,1))
    const code=raw===null||raw===undefined||raw===''?null:String(raw).replace(/\.0$/,'').trim()
    const description=text(sheet,addr(row,3))||null,sourceCategory=text(sheet,addr(row,4))||null
    const cl=classifyTreasury(code,sourceCategory,description),entryDate=isoDate(sheet,addr(row,2))
    const direction=outbound>0?'out':'in',amount=outbound>0?outbound:inbound,runningBalance=nullableNum(sheet,addr(row,7))
    if(direction==='out'&&cl.classificationConfidence==='unclassified')issues.push({sheetName:'الخزنة',rowNumber:row,cellRef:`D${row}`,code:'UNCLASSIFIED_CASH_OUTFLOW',severity:'warning',message:`حركة صادرة بدون توجيه واضح: ${description??'بدون بيان'}`,rawValue:{source_code:code,category:sourceCategory,amount}})
    out.push({entryDate,sourceRow:row,sourceCode:code,description,sourceCategory,canonicalCategory:cl.canonicalCategory,expenseGroup:cl.expenseGroup,entryKind:cl.entryKind,isExpense:cl.isExpense,classificationConfidence:cl.classificationConfidence,amount,direction,runningBalance,rawPayload:{source_row:row}})
  }return out
}
function extractRepDay(sheet,name,businessDate,issues){
  const reps=[],seen=new Set()
  REP_COLUMNS.forEach((col,index)=>{
    const rep=text(sheet,`${col}9`).replace(/\s+/g,' ').trim();if(!rep)return
    if(seen.has(rep)){issues.push({sheetName:name,rowNumber:9,cellRef:`${col}9`,code:'DUPLICATE_REP_IN_DAY',severity:'error',message:`المندوب "${rep}" مكرر في نفس اليوم`,rawValue:rep});return}
    seen.add(rep)
    const opening=num(sheet,`${col}2`),net=num(sheet,`${col}3`),deposit=num(sheet,`${col}4`),expense=num(sheet,`${col}5`),extra=num(sheet,`${col}6`),disc=num(sheet,`${col}7`),closing=num(sheet,`${col}8`)
    reps.push({slot:index+1,sourceColumn:col,sourceAnchorCell:`${col}9`,repName:rep,openingBalance:opening,netAfterDiscount:net,depositAmount:deposit,expenseAmount:expense,extraDiscount:extra,totalDiscount:disc,closingBalance:closing,salesBeforeDiscount:net+disc,rawPayload:{}})
  })
  return {sheetName:name,businessDate,reps}
}
function extractInventoryDaily(sheet,name,businessDate){
  const out=[],{rows}=dims(sheet);let header=0
  for(let r=1;r<=Math.min(rows,30);r++){if(text(sheet,`AX${r}`).includes('باركود')&&text(sheet,`BI${r}`).includes('رصيد اخر')){header=r;break}}
  if(!header)return out
  for(let row=header+1;row<=rows;row++){
    const product=text(sheet,`D${row}`).replace(/\s+/g,' ').trim()
    const barcode=text(sheet,`AX${row}`),barcodeNum=num(sheet,`AX${row}`)
    if(!product.replace(/[\s*]+/g,'')||(!barcode&&barcodeNum===0))continue
    const unit=nullableNum(sheet,`E${row}`),closing=num(sheet,`BI${row}`)
    out.push({businessDate,sourceSheet:name,sourceRow:row,barcode:barcode||(barcodeNum?String(barcodeNum):null),productName:product,unitValue:unit,
      openingQty:num(sheet,`AY${row}`),incomingFactoryQty:num(sheet,`AZ${row}`),incomingBranchesQty:num(sheet,`BA${row}`),
      salesQty:num(sheet,`BB${row}`),bonusQty:num(sheet,`BC${row}`),giftsQty:num(sheet,`BD${row}`),damagesQty:num(sheet,`BE${row}`),
      returnFactoryQty:num(sheet,`BF${row}`),outgoingBranchesQty:num(sheet,`BG${row}`),adjustmentsQty:num(sheet,`BH${row}`),closingQty:closing,
      closingValue:unit===null?null:closing*unit,rawPayload:{source_row:row}})
  }return out
}

export async function parseWorkbookBrowser(file,{periodStart,periodEnd}={}){
  const buffer=await file.arrayBuffer()
  const wb=XLSX.read(buffer,{type:'array',cellDates:true,cellFormula:true,cellNF:false,cellText:false,dense:false})
  const sheets=[],issues=[],representativeDays=[],inventoryDaily=[]
  let products=[],remittances=[],warehouseDaily=[],inventoryCounts=[],treasuryEntries=[]
  const trimmed=new Set(wb.SheetNames.map(n=>n.trim()))
  for(const required of REQUIRED_SHEETS)if(!trimmed.has(required))issues.push({sheetName:required,code:'MISSING_REQUIRED_SHEET',severity:'error',message:`الصفحة الأساسية "${required}" غير موجودة`})
  const dailyNames=wb.SheetNames.filter(n=>/^\d{1,2}-?$/.test(n.trim()))
  if(!dailyNames.length)issues.push({code:'NO_DAILY_SHEETS',severity:'error',message:'لم يتم العثور على صفحات الأيام'})
  wb.SheetNames.forEach((name,index)=>{
    const sheet=wb.Sheets[name],d=dims(sheet)
    sheets.push({name,index,rowCount:d.rows,columnCount:d.cols,rows:[]})
    const t=name.trim()
    if(t==='DATA')products=extractProducts(sheet)
    if(t==='توريدات')remittances=extractRemittances(sheet)
    if(t==='حركة المخزن')warehouseDaily=extractWarehouse(sheet)
    if(t==='الجرد')inventoryCounts=extractCounts(sheet,periodEnd)
    if(t==='الخزنة')treasuryEntries=extractTreasury(sheet,issues)
    const businessDate=dailyDate(name,periodStart)
    if(businessDate){representativeDays.push(extractRepDay(sheet,name,businessDate,issues));inventoryDaily.push(...extractInventoryDaily(sheet,name,businessDate))}
  })
  return {
    sheets,issues,representativeDays,inventoryDaily,products,remittances,warehouseDaily,inventoryCounts,treasuryEntries,
    schemaVersion:'ammco-browser-v1',
    stats:{
      sheetCount:sheets.length,rawRowCount:0,dailySheetCount:dailyNames.length,
      representativeDayCount:representativeDays.length,representativeRowCount:representativeDays.reduce((s,d)=>s+d.reps.length,0),
      representativeTemplateSlots:REP_COLUMNS.length,inventoryDailyRowCount:inventoryDaily.length,productCount:products.length,
      remittanceRowCount:remittances.length,warehouseDayCount:warehouseDaily.length,inventoryCountRowCount:inventoryCounts.length,
      treasuryEntryCount:treasuryEntries.length,expenseEntryCount:treasuryEntries.filter(e=>e.isExpense).length
    }
  }
}

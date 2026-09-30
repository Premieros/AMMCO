import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://yumeijsyiphzdsulsubf.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1bWVpanN5aXBoemRzdWxzdWJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2ODk1ODAsImV4cCI6MjEwNjI2NTU4MH0.Hpy2VZpttnQGdrx6_6Y1c9w4iHG2HhopvFdrohk3BBE'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function run() {
  console.log('--- 1. Querying Products ---')
  const { data: products, error: pErr } = await supabase.from('products').select('*')
  if (pErr) console.error('Product error:', pErr)
  console.log(`Total products: ${products?.length}`)

  console.log('\n--- Sample Products & Prices ---')
  const sample = (products || []).map(p => ({
    id: p.id,
    name: p.name,
    box_count: p.box_count,
    packaging_count: p.packaging_count,
    wholesale_carton_price: p.wholesale_carton_price,
    retail_carton_price: p.retail_carton_price,
    price_category: p.price_category,
    carton_descriptor: p.carton_descriptor
  }))
  console.log(JSON.stringify(sample.slice(0, 15), null, 2))

  console.log('\n--- 2. Checking Double Classification on Products ---')
  // User Rule: Packing = 12 AND Price = 570
  const matchedStrict = []
  const falseDoubles = []
  const missingData = []

  for (const p of products || []) {
    const packing = p.box_count ?? p.packaging_count
    const price = p.wholesale_carton_price ?? p.retail_carton_price
    const nameHasDouble = (p.name || '').includes('دبل') || (p.name || '').toLowerCase().includes('double')

    const isPacking12 = Number(packing) === 12
    const isPrice570 = Number(price) === 570

    if (packing == null || price == null) {
      if (nameHasDouble || isPacking12 || isPrice570) {
        missingData.push({ name: p.name, packing, price, nameHasDouble })
      }
    } else if (isPacking12 && isPrice570) {
      matchedStrict.push({ name: p.name, packing, price })
    } else if (nameHasDouble || isPacking12 || isPrice570) {
      falseDoubles.push({
        name: p.name,
        packing,
        price,
        reason: !isPacking12 ? `Packing is ${packing} (not 12)` : `Price is ${price} (not 570)`
      })
    }
  }

  console.log(`Strict Matches (Packing=12 & Price=570): ${matchedStrict.length}`)
  console.log(JSON.stringify(matchedStrict, null, 2))

  console.log(`\nFalse Doubles / Non-matching: ${falseDoubles.length}`)
  console.log(JSON.stringify(falseDoubles, null, 2))

  console.log(`\nMissing Data: ${missingData.length}`)
  console.log(JSON.stringify(missingData, null, 2))

  console.log('\n--- 3. Checking Inventory Daily Rows ---')
  const { data: invRows, error: iErr } = await supabase.from('inventory_daily').select('id, business_date, product_id, product_name, sales_qty, closing_qty, closing_value, unit_value').limit(20)
  if (iErr) console.error('Inv error:', iErr)
  console.log(JSON.stringify(invRows, null, 2))

  console.log('\n--- 4. Checking v_branch_daily_kpis ---')
  const { data: kpiRows, error: kErr } = await supabase.from('v_branch_daily_kpis').select('*').limit(5)
  if (kErr) console.error('KPI error:', kErr)
  console.log(JSON.stringify(kpiRows, null, 2))

  console.log('\n--- 5. Checking warehouse_daily_summary ---')
  const { data: whRows, error: wErr } = await supabase.from('warehouse_daily_summary').select('*').limit(3)
  if (wErr) console.error('WH error:', wErr)
  console.log(JSON.stringify(whRows, null, 2))
}

run()

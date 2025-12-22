import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function handleYemeksepetiOrder(body) {
  try {
    console.log('🍔 YEMEKSEPETI HANDLER ÇALIŞTI')
    console.log('body:', body)

    const orderId =
      body?.orderId ||
      body?.id ||
      body?.code ||
      body?.foodOrder?.id ||
      null

    const { error } = await supabase
      .from('yemeksepeti_orders')
      .insert({
        order_id: orderId,
        platform: 'YEMEKSEPETI',
        raw_payload: body
      })

    if (error) {
      console.error('❌ Supabase insert error:', error)
      return false
    }

    console.log('✅ YEMEKSEPETI ORDER DB KAYDEDILDI')
    return true
  } catch (err) {
    console.error('🔥 YEMEKSEPETI HANDLER ERROR:', err)
    return false
  }
}
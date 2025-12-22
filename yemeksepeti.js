import express from 'express'
import { createClient } from '@supabase/supabase-js'

const router = express.Router()

// Supabase bağlantısı
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // service role şart
)

/**
 * YEMEKSEPETI WEBHOOK
 * POST /webhook/yemeksepeti
 */
router.post('/webhook/yemeksepeti', async (req, res) => {
  try {
    const body = req.body

    console.log('🍔 YEMEKSEPETI WEBHOOK GELDI')
    console.log('orderId:', body?.orderId || body?.id)
    console.log('body:', body)

    const orderId =
      body?.orderId ||
      body?.id ||
      body?.code || // fallback
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
      return res.status(500).json({ success: false })
    }

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('🔥 YEMEKSEPETI WEBHOOK ERROR:', err)
    return res.status(500).json({ success: false })
  }
})

export default router
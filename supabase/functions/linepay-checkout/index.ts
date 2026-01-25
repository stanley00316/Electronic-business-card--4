// Supabase Edge Function: linepay-checkout
// 用途：建立 LINE Pay 付款請求
// 環境變數需設定：
// - LINEPAY_CHANNEL_ID: LINE Pay Channel ID
// - LINEPAY_CHANNEL_SECRET: LINE Pay Channel Secret
// - LINEPAY_SANDBOX: 是否使用 Sandbox（'true' 或 'false'）
// - FRONTEND_URL: 前端網址（用於重導向）

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createHmac } from 'https://deno.land/std@0.168.0/node/crypto.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// LINE Pay API Helper
function generateLinePaySignature(channelSecret: string, uri: string, body: string, nonce: string): string {
  const message = channelSecret + uri + body + nonce
  const hmac = createHmac('sha256', channelSecret)
  hmac.update(message)
  return hmac.digest('base64')
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const channelId = Deno.env.get('LINEPAY_CHANNEL_ID')
    const channelSecret = Deno.env.get('LINEPAY_CHANNEL_SECRET')
    const isSandbox = Deno.env.get('LINEPAY_SANDBOX') === 'true'
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const frontendUrl = Deno.env.get('FRONTEND_URL') || 'https://stanley00316.github.io/Electronic-business-card--4'

    if (!channelId || !channelSecret) {
      return new Response(
        JSON.stringify({ error: 'LINE Pay not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 解析請求
    const { user_id, plan_id } = await req.json()

    if (!user_id || !plan_id) {
      return new Response(
        JSON.stringify({ error: 'Missing user_id or plan_id' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // 取得價格方案
    const { data: plan, error: planError } = await supabase
      .from('pricing_plans')
      .select('*')
      .eq('id', plan_id)
      .eq('is_active', true)
      .single()

    if (planError || !plan) {
      return new Response(
        JSON.stringify({ error: 'Plan not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    // 建立 LINE Pay 付款請求
    const orderId = `ORDER_${user_id.substring(0, 8)}_${Date.now()}`
    const amount = Math.round(plan.price / 100) // 轉換為元（LINE Pay 使用元為單位）

    const requestUri = '/v3/payments/request'
    const baseUrl = isSandbox 
      ? 'https://sandbox-api-pay.line.me' 
      : 'https://api-pay.line.me'

    const confirmUrl = `${supabaseUrl}/functions/v1/linepay-confirm`
    
    const requestBody = {
      amount: amount,
      currency: 'TWD',
      orderId: orderId,
      packages: [
        {
          id: plan_id,
          amount: amount,
          name: plan.name,
          products: [
            {
              id: plan_id,
              name: plan.name,
              quantity: 1,
              price: amount
            }
          ]
        }
      ],
      redirectUrls: {
        confirmUrl: `${frontendUrl}/subscription.html?linepay=confirm&orderId=${orderId}`,
        cancelUrl: `${frontendUrl}/subscription.html?payment=cancelled`
      },
      options: {
        display: {
          locale: 'zh_TW'
        }
      }
    }

    const nonce = Date.now().toString()
    const bodyString = JSON.stringify(requestBody)
    const signature = generateLinePaySignature(channelSecret, requestUri, bodyString, nonce)

    // 呼叫 LINE Pay API
    const response = await fetch(`${baseUrl}${requestUri}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-LINE-ChannelId': channelId,
        'X-LINE-Authorization-Nonce': nonce,
        'X-LINE-Authorization': signature
      },
      body: bodyString
    })

    const data = await response.json()

    if (data.returnCode !== '0000') {
      console.error('LINE Pay request failed:', data)
      return new Response(
        JSON.stringify({ error: data.returnMessage || 'LINE Pay request failed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // 儲存交易資訊（用於 confirm 時驗證）
    await supabase
      .from('payment_history')
      .insert({
        user_id: user_id,
        payment_provider: 'linepay',
        payment_id: orderId,
        amount: plan.price,
        currency: 'TWD',
        status: 'pending',
        payment_details: {
          plan_id: plan_id,
          duration_days: plan.duration_days,
          transaction_id: data.info.transactionId
        }
      })

    return new Response(
      JSON.stringify({
        success: true,
        payment_url: data.info.paymentUrl.web,
        transaction_id: data.info.transactionId,
        order_id: orderId
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    console.error('linepay-checkout error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})

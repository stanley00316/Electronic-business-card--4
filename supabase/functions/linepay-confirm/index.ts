// Supabase Edge Function: linepay-confirm
// 用途：確認 LINE Pay 付款並更新訂閱
// 環境變數需設定：
// - LINEPAY_CHANNEL_ID: LINE Pay Channel ID
// - LINEPAY_CHANNEL_SECRET: LINE Pay Channel Secret
// - LINEPAY_SANDBOX: 是否使用 Sandbox（'true' 或 'false'）

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

    if (!channelId || !channelSecret) {
      return new Response(
        JSON.stringify({ error: 'LINE Pay not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 解析請求
    const { transaction_id, order_id } = await req.json()

    if (!transaction_id || !order_id) {
      return new Response(
        JSON.stringify({ error: 'Missing transaction_id or order_id' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // 取得付款記錄
    const { data: payment, error: paymentError } = await supabase
      .from('payment_history')
      .select('*')
      .eq('payment_id', order_id)
      .eq('status', 'pending')
      .single()

    if (paymentError || !payment) {
      return new Response(
        JSON.stringify({ error: 'Payment not found or already processed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    const amount = Math.round(payment.amount / 100) // 轉換為元

    // 呼叫 LINE Pay Confirm API
    const requestUri = `/v3/payments/requests/${transaction_id}/confirm`
    const baseUrl = isSandbox 
      ? 'https://sandbox-api-pay.line.me' 
      : 'https://api-pay.line.me'

    const requestBody = {
      amount: amount,
      currency: 'TWD'
    }

    const nonce = Date.now().toString()
    const bodyString = JSON.stringify(requestBody)
    const signature = generateLinePaySignature(channelSecret, requestUri, bodyString, nonce)

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
      console.error('LINE Pay confirm failed:', data)
      
      // 更新付款記錄為失敗
      await supabase
        .from('payment_history')
        .update({ status: 'failed' })
        .eq('payment_id', order_id)

      return new Response(
        JSON.stringify({ error: data.returnMessage || 'LINE Pay confirm failed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // 付款成功，更新訂閱
    const userId = payment.user_id
    const durationDays = payment.payment_details?.duration_days || 30
    const now = new Date()

    // 取得目前訂閱
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single()

    // 計算新的結束日期
    let startDate = now
    if (sub) {
      let currentEnd: Date | null = null
      if (sub.subscription_end_at) {
        currentEnd = new Date(sub.subscription_end_at)
      } else if (sub.trial_end_at) {
        currentEnd = new Date(sub.trial_end_at)
      }
      
      if (sub.referral_bonus_days > 0 && currentEnd) {
        currentEnd.setDate(currentEnd.getDate() + sub.referral_bonus_days)
      }

      if (currentEnd && currentEnd > now) {
        startDate = currentEnd
      }
    }

    const endDate = new Date(startDate)
    endDate.setDate(endDate.getDate() + durationDays)

    // 更新或建立訂閱
    if (sub) {
      await supabase
        .from('subscriptions')
        .update({
          status: 'active',
          subscription_start_at: sub.subscription_start_at || now.toISOString(),
          subscription_end_at: endDate.toISOString(),
          payment_provider: 'linepay',
          payment_id: transaction_id,
          amount: payment.amount,
          updated_at: now.toISOString()
        })
        .eq('user_id', userId)
    } else {
      await supabase
        .from('subscriptions')
        .insert({
          user_id: userId,
          status: 'active',
          subscription_start_at: now.toISOString(),
          subscription_end_at: endDate.toISOString(),
          payment_provider: 'linepay',
          payment_id: transaction_id,
          amount: payment.amount
        })
    }

    // 確保名片可見
    await supabase
      .from('cards')
      .update({ is_visible: true })
      .eq('user_id', userId)

    // 更新付款記錄為完成
    await supabase
      .from('payment_history')
      .update({
        status: 'completed',
        period_start: startDate.toISOString(),
        period_end: endDate.toISOString(),
        completed_at: now.toISOString(),
        payment_details: {
          ...payment.payment_details,
          confirm_response: data
        }
      })
      .eq('payment_id', order_id)

    console.log(`LINE Pay payment successful for user ${userId}, subscription extended to ${endDate.toISOString()}`)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Payment confirmed',
        subscription_end: endDate.toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    console.error('linepay-confirm error:', error)
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

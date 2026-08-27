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

function base64UrlEncode(bytes: Uint8Array) {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(str: string) {
  let s = str.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  const bin = atob(s)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

// 驗證使用者現有登入 JWT 是否有效，確保呼叫者真的是合法登入中的使用者本人。
// 與 google-auth/index.ts 的 verifyJwtHS256 完全相同。
async function verifyJwtHS256(token: string, secret: string): Promise<Record<string, unknown> | null> {
  try {
    const parts = String(token || '').split('.')
    if (parts.length !== 3) return null
    const [headerB64, payloadB64, sigB64] = parts
    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const expectedSig = await crypto.subtle.sign('HMAC', key, enc.encode(`${headerB64}.${payloadB64}`))
    const expectedSigB64 = base64UrlEncode(new Uint8Array(expectedSig))
    if (expectedSigB64 !== sigB64) return null

    const payload = JSON.parse(base64UrlDecode(payloadB64))
    const exp = Number(payload?.exp || 0)
    if (!exp || Math.floor(Date.now() / 1000) >= exp) return null
    if (!payload?.sub) return null
    return payload
  } catch (_e) {
    return null
  }
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
    const jwtSecret = Deno.env.get('JWT_SECRET') || Deno.env.get('SUPABASE_JWT_SECRET') || ''

    if (!channelId || !channelSecret) {
      return new Response(
        JSON.stringify({ error: 'LINE Pay not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }, status: 500 }
      )
    }
    if (!jwtSecret) {
      return new Response(
        JSON.stringify({ error: 'JWT secret not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }, status: 500 }
      )
    }

    // 驗證呼叫者真實身份：一定要是合法登入中的使用者才能確認付款。
    const authHeader = req.headers.get('authorization') || ''
    const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : ''
    const jwtPayload = bearerToken ? await verifyJwtHS256(bearerToken, jwtSecret) : null
    if (!jwtPayload) {
      return new Response(
        JSON.stringify({ error: 'UNAUTHORIZED' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }, status: 401 }
      )
    }
    const callerUserId = String(jwtPayload.sub)

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 解析請求：transaction_id 只用來跟資料庫裡存的值比對，實際呼叫 LINE Pay 一律用資料庫的值，
    // 避免前端這次呼叫傳來的 transaction_id 被拿去換一個不相關的交易。
    const { transaction_id: clientTransactionId, order_id } = await req.json()

    if (!clientTransactionId || !order_id) {
      return new Response(
        JSON.stringify({ error: 'Missing transaction_id or order_id' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }, status: 400 }
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
        { headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }, status: 404 }
      )
    }

    // 確認呼叫者就是這筆訂單本人
    if (String(payment.user_id) !== callerUserId) {
      return new Response(
        JSON.stringify({ error: 'FORBIDDEN' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }, status: 403 }
      )
    }

    // 確認前端傳來的 transaction_id 跟建單時存的一致，才使用資料庫裡的值去呼叫 LINE Pay
    const storedTransactionId = String(payment.payment_details?.transaction_id || '')
    if (!storedTransactionId || storedTransactionId !== String(clientTransactionId)) {
      return new Response(
        JSON.stringify({ error: 'TRANSACTION_MISMATCH' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }, status: 400 }
      )
    }
    const transaction_id = storedTransactionId

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
        'Content-Type': 'application/json; charset=utf-8',
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
        { headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }, status: 400 }
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

    // 計算新的結束日期。
    // 注意：這裡刻意不加 referral_bonus_days——那是「每次查詢當下」由資料庫
    // get_subscription_end_date() 動態加總的獎勵，不會被消耗，如果這裡又手動加一次
    // 再存回 subscription_end_at，同一批推薦獎勵天數會隨著每次付款被重複疊加。
    let startDate = now
    if (sub) {
      let currentEnd: Date | null = null
      if (sub.subscription_end_at) {
        currentEnd = new Date(sub.subscription_end_at)
      } else if (sub.trial_end_at) {
        currentEnd = new Date(sub.trial_end_at)
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
        headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
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
        headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
        status: 500
      }
    )
  }
})

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
    const frontendUrl = Deno.env.get('FRONTEND_URL') || 'https://stanley00316.github.io/Electronic-business-card--4'
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

    // 驗證呼叫者真實身份：user_id 一律用驗證過的登入 JWT 的 sub，不信任前端 body 傳來的值。
    const authHeader = req.headers.get('authorization') || ''
    const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : ''
    const jwtPayload = bearerToken ? await verifyJwtHS256(bearerToken, jwtSecret) : null
    if (!jwtPayload) {
      return new Response(
        JSON.stringify({ error: 'UNAUTHORIZED' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }, status: 401 }
      )
    }
    const user_id = String(jwtPayload.sub)

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 解析請求
    const { plan_id } = await req.json()

    if (!plan_id) {
      return new Response(
        JSON.stringify({ error: 'Missing plan_id' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }, status: 400 }
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
        { headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }, status: 404 }
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
        'Content-Type': 'application/json; charset=utf-8',
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
        { headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }, status: 400 }
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
        headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
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
        headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
        status: 500
      }
    )
  }
})

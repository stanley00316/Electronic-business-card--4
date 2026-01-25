// Supabase Edge Function: stripe-webhook
// 用途：處理 Stripe 付款成功後的 Webhook
// 設定方式：在 Stripe Dashboard 設定 Webhook URL 為此函數的 URL

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@13.10.0?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    if (!stripeSecretKey || !webhookSecret) {
      return new Response(
        JSON.stringify({ error: 'Stripe not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    })

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 驗證 Stripe 簽名
    const signature = req.headers.get('stripe-signature')
    if (!signature) {
      return new Response(
        JSON.stringify({ error: 'Missing stripe-signature' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const body = await req.text()
    let event: Stripe.Event

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
    } catch (err) {
      console.error('Webhook signature verification failed:', err)
      return new Response(
        JSON.stringify({ error: 'Invalid signature' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // 處理付款成功事件
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session

      const userId = session.client_reference_id || session.metadata?.user_id
      const planId = session.metadata?.plan_id
      const durationDays = parseInt(session.metadata?.duration_days || '30')

      if (!userId) {
        console.error('Missing user_id in session')
        return new Response(
          JSON.stringify({ error: 'Missing user_id' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }

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
        // 如果有現有訂閱且未過期，從現有結束日期開始計算
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
            payment_provider: 'stripe',
            payment_id: session.payment_intent as string,
            amount: session.amount_total,
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
            payment_provider: 'stripe',
            payment_id: session.payment_intent as string,
            amount: session.amount_total
          })
      }

      // 確保名片可見
      await supabase
        .from('cards')
        .update({ is_visible: true })
        .eq('user_id', userId)

      // 記錄付款歷史
      await supabase
        .from('payment_history')
        .insert({
          user_id: userId,
          payment_provider: 'stripe',
          payment_id: session.payment_intent as string,
          amount: session.amount_total,
          currency: session.currency?.toUpperCase() || 'TWD',
          status: 'completed',
          period_start: startDate.toISOString(),
          period_end: endDate.toISOString(),
          payment_details: {
            session_id: session.id,
            plan_id: planId,
            customer_email: session.customer_details?.email
          },
          completed_at: now.toISOString()
        })

      console.log(`Payment successful for user ${userId}, subscription extended to ${endDate.toISOString()}`)
    }

    return new Response(
      JSON.stringify({ received: true }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    console.error('stripe-webhook error:', error)
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

// Supabase Edge Function: stripe-checkout
// 用途：建立 Stripe Checkout Session 供用戶付款
// 環境變數需設定：
// - STRIPE_SECRET_KEY: Stripe 密鑰
// - STRIPE_WEBHOOK_SECRET: Webhook 簽名密鑰
// - FRONTEND_URL: 前端網址（用於重導向）

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@13.10.0?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const frontendUrl = Deno.env.get('FRONTEND_URL') || 'https://stanley00316.github.io/Electronic-business-card--4'

    if (!stripeSecretKey) {
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

    // 解析請求
    const { user_id, plan_id, return_url } = await req.json()

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

    // 取得用戶資訊（用於 Stripe 客戶資料）
    const { data: card } = await supabase
      .from('cards')
      .select('name, email')
      .eq('user_id', user_id)
      .single()

    // 建立 Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: plan.currency?.toLowerCase() || 'twd',
            product_data: {
              name: plan.name,
              description: plan.description || `${plan.duration_days} 天訂閱`,
            },
            unit_amount: plan.price, // 價格以分為單位
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${frontendUrl}/subscription.html?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/subscription.html?payment=cancelled`,
      client_reference_id: user_id,
      customer_email: card?.email || undefined,
      metadata: {
        user_id: user_id,
        plan_id: plan_id,
        duration_days: plan.duration_days.toString(),
      },
    })

    return new Response(
      JSON.stringify({
        success: true,
        checkout_url: session.url,
        session_id: session.id
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    console.error('stripe-checkout error:', error)
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

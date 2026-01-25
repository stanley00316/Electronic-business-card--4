// Supabase Edge Function: check-subscriptions
// 用途：定時檢查訂閱狀態，更新過期訂閱並隱藏名片
// 建議透過 Supabase Dashboard 或 cron.org 設定每日執行

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
    // 驗證請求（可選：加上 API Key 驗證）
    const authHeader = req.headers.get('Authorization')
    const apiKey = req.headers.get('x-api-key')
    
    // 使用 service role key 建立客戶端（需要完整權限）
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    const now = new Date().toISOString()
    let expiredCount = 0
    let hiddenCount = 0
    let referralUpdates = 0

    // 1. 取得所有訂閱記錄
    const { data: subscriptions, error: fetchError } = await supabase
      .from('subscriptions')
      .select('*')
      .in('status', ['trial', 'active'])

    if (fetchError) {
      throw new Error(`取得訂閱失敗: ${fetchError.message}`)
    }

    // 2. 檢查每個訂閱是否過期
    for (const sub of subscriptions || []) {
      // 計算結束日期
      let endDate: Date
      if (sub.subscription_end_at) {
        endDate = new Date(sub.subscription_end_at)
      } else if (sub.trial_end_at) {
        endDate = new Date(sub.trial_end_at)
      } else {
        const trialStart = new Date(sub.trial_start_at || sub.created_at)
        endDate = new Date(trialStart)
        endDate.setDate(endDate.getDate() + 30)
      }

      // 加上推薦獎勵天數
      if (sub.referral_bonus_days > 0) {
        endDate.setDate(endDate.getDate() + sub.referral_bonus_days)
      }

      // 檢查是否過期
      if (endDate < new Date()) {
        // 更新訂閱狀態為 expired
        const { error: updateError } = await supabase
          .from('subscriptions')
          .update({ status: 'expired', updated_at: now })
          .eq('user_id', sub.user_id)

        if (!updateError) {
          expiredCount++

          // 隱藏該用戶的名片
          const { error: hideError } = await supabase
            .from('cards')
            .update({ is_visible: false })
            .eq('user_id', sub.user_id)

          if (!hideError) {
            hiddenCount++
          }
        }
      }
    }

    // 3. 更新推薦獎勵（檢查新的推薦關係）
    const { data: allSubs } = await supabase
      .from('subscriptions')
      .select('user_id, referral_bonus_days, last_referral_check')

    for (const sub of allSubs || []) {
      // 計算該用戶的推薦人數
      const { count } = await supabase
        .from('referrals')
        .select('*', { count: 'exact', head: true })
        .eq('referrer_user_id', sub.user_id)

      const referralCount = count || 0
      const lastCheck = sub.last_referral_check || 0

      // 如果推薦人數有變化，更新獎勵
      if (referralCount !== lastCheck) {
        const bonusDays = Math.floor(referralCount / 3) * 180

        await supabase
          .from('subscriptions')
          .update({
            referral_bonus_days: bonusDays,
            last_referral_check: referralCount,
            updated_at: now
          })
          .eq('user_id', sub.user_id)

        referralUpdates++
      }
    }

    // 4. 回傳結果
    return new Response(
      JSON.stringify({
        success: true,
        timestamp: now,
        stats: {
          expiredSubscriptions: expiredCount,
          hiddenCards: hiddenCount,
          referralUpdates: referralUpdates
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    console.error('check-subscriptions error:', error)
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

-- ===== 訂閱系統資料表 =====
-- 用途：管理用戶付費訂閱、免費試用、推薦獎勵

-- 1. 修改 cards 表：新增可見性欄位
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS is_visible BOOLEAN DEFAULT true;

-- 2. 建立訂閱表
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  
  -- 訂閱狀態：trial（試用）、active（付費中）、expired（已過期）、cancelled（已取消）
  status TEXT NOT NULL DEFAULT 'trial',
  
  -- 時間記錄
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),      -- 訂閱記錄建立時間
  trial_start_at TIMESTAMPTZ DEFAULT now(),           -- 試用開始時間
  trial_end_at TIMESTAMPTZ,                           -- 試用結束時間
  subscription_start_at TIMESTAMPTZ,                  -- 付費訂閱開始時間
  subscription_end_at TIMESTAMPTZ,                    -- 付費訂閱結束時間
  
  -- 推薦獎勵
  referral_bonus_days INTEGER DEFAULT 0,              -- 透過推薦獲得的額外天數
  last_referral_check INTEGER DEFAULT 0,              -- 上次檢查時的推薦人數（避免重複計算）
  
  -- 付款資訊
  payment_provider TEXT,                              -- stripe, linepay, manual
  payment_id TEXT,                                    -- 金流交易 ID
  amount INTEGER,                                     -- 金額（新台幣，以分為單位）
  currency TEXT DEFAULT 'TWD',                        -- 幣別
  
  -- 管理員操作記錄
  extended_by UUID,                                   -- 延長訂閱的管理員 ID
  extend_reason TEXT,                                 -- 延長原因
  extended_at TIMESTAMPTZ,                            -- 延長時間
  
  -- 更新時間
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 建立索引
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_trial_end ON public.subscriptions(trial_end_at);
CREATE INDEX IF NOT EXISTS idx_subscriptions_subscription_end ON public.subscriptions(subscription_end_at);

-- 自動更新 updated_at
DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- 3. 建立付款記錄表（保存完整付款歷史）
CREATE TABLE IF NOT EXISTS public.payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  subscription_id UUID REFERENCES public.subscriptions(id),
  
  -- 付款資訊
  payment_provider TEXT NOT NULL,                     -- stripe, linepay, manual
  payment_id TEXT,                                    -- 金流交易 ID
  amount INTEGER NOT NULL,                            -- 金額
  currency TEXT DEFAULT 'TWD',                        -- 幣別
  status TEXT NOT NULL DEFAULT 'pending',             -- pending, completed, failed, refunded
  
  -- 訂閱期間
  period_start TIMESTAMPTZ,                           -- 本次付款對應的訂閱開始時間
  period_end TIMESTAMPTZ,                             -- 本次付款對應的訂閱結束時間
  
  -- 付款詳情（JSON 格式儲存原始回應）
  payment_details JSONB DEFAULT '{}'::jsonb,
  
  -- 時間記錄
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- 建立索引
CREATE INDEX IF NOT EXISTS idx_payment_history_user_id ON public.payment_history(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_subscription_id ON public.payment_history(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_status ON public.payment_history(status);

-- 4. 建立價格方案表
CREATE TABLE IF NOT EXISTS public.pricing_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                                 -- 方案名稱
  name_en TEXT,                                       -- 英文名稱
  description TEXT,                                   -- 方案說明
  description_en TEXT,                                -- 英文說明
  
  -- 價格設定
  price INTEGER NOT NULL,                             -- 價格（新台幣，以分為單位）
  currency TEXT DEFAULT 'TWD',                        -- 幣別
  duration_days INTEGER NOT NULL,                     -- 訂閱天數
  
  -- 狀態
  is_active BOOLEAN DEFAULT true,                     -- 是否啟用
  sort_order INTEGER DEFAULT 0,                       -- 排序順序
  
  -- 時間記錄
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 自動更新 updated_at
DROP TRIGGER IF EXISTS trg_pricing_plans_updated_at ON public.pricing_plans;
CREATE TRIGGER trg_pricing_plans_updated_at
BEFORE UPDATE ON public.pricing_plans
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- 插入預設價格方案
INSERT INTO public.pricing_plans (name, name_en, description, description_en, price, duration_days, sort_order)
VALUES 
  ('月費方案', 'Monthly Plan', '每月訂閱，隨時取消', 'Monthly subscription, cancel anytime', 9900, 30, 1),
  ('季費方案', 'Quarterly Plan', '每季訂閱，享 9 折優惠', 'Quarterly subscription, 10% off', 26700, 90, 2),
  ('年費方案', 'Yearly Plan', '年度訂閱，享 8 折優惠', 'Yearly subscription, 20% off', 95000, 365, 3)
ON CONFLICT DO NOTHING;

-- ===== RLS 政策 =====

-- subscriptions 表
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- 用戶可以查看自己的訂閱
DROP POLICY IF EXISTS "subscriptions_own_select" ON public.subscriptions;
CREATE POLICY "subscriptions_own_select" ON public.subscriptions
FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- 用戶可以插入自己的訂閱（註冊時自動建立）
DROP POLICY IF EXISTS "subscriptions_own_insert" ON public.subscriptions;
CREATE POLICY "subscriptions_own_insert" ON public.subscriptions
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- 用戶可以更新自己的訂閱（推薦獎勵等）
DROP POLICY IF EXISTS "subscriptions_own_update" ON public.subscriptions;
CREATE POLICY "subscriptions_own_update" ON public.subscriptions
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- 管理員可以查看所有訂閱
DROP POLICY IF EXISTS "subscriptions_admin_select" ON public.subscriptions;
CREATE POLICY "subscriptions_admin_select" ON public.subscriptions
FOR SELECT TO authenticated
USING (public.is_admin());

-- 管理員可以更新所有訂閱（手動延長等）
DROP POLICY IF EXISTS "subscriptions_admin_update" ON public.subscriptions;
CREATE POLICY "subscriptions_admin_update" ON public.subscriptions
FOR UPDATE TO authenticated
USING (public.is_admin());

-- payment_history 表
ALTER TABLE public.payment_history ENABLE ROW LEVEL SECURITY;

-- 用戶可以查看自己的付款記錄
DROP POLICY IF EXISTS "payment_history_own_select" ON public.payment_history;
CREATE POLICY "payment_history_own_select" ON public.payment_history
FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- 管理員可以查看所有付款記錄
DROP POLICY IF EXISTS "payment_history_admin_select" ON public.payment_history;
CREATE POLICY "payment_history_admin_select" ON public.payment_history
FOR SELECT TO authenticated
USING (public.is_admin());

-- 管理員可以插入付款記錄
DROP POLICY IF EXISTS "payment_history_admin_insert" ON public.payment_history;
CREATE POLICY "payment_history_admin_insert" ON public.payment_history
FOR INSERT TO authenticated
WITH CHECK (public.is_admin());

-- pricing_plans 表
ALTER TABLE public.pricing_plans ENABLE ROW LEVEL SECURITY;

-- 所有登入用戶可以查看啟用的價格方案
DROP POLICY IF EXISTS "pricing_plans_authenticated_select" ON public.pricing_plans;
CREATE POLICY "pricing_plans_authenticated_select" ON public.pricing_plans
FOR SELECT TO authenticated
USING (is_active = true);

-- 管理員可以查看所有價格方案（包含停用的）
DROP POLICY IF EXISTS "pricing_plans_admin_select" ON public.pricing_plans;
CREATE POLICY "pricing_plans_admin_select" ON public.pricing_plans
FOR SELECT TO authenticated
USING (public.is_admin());

-- 管理員可以新增價格方案
DROP POLICY IF EXISTS "pricing_plans_admin_insert" ON public.pricing_plans;
CREATE POLICY "pricing_plans_admin_insert" ON public.pricing_plans
FOR INSERT TO authenticated
WITH CHECK (public.is_admin());

-- 管理員可以更新價格方案
DROP POLICY IF EXISTS "pricing_plans_admin_update" ON public.pricing_plans;
CREATE POLICY "pricing_plans_admin_update" ON public.pricing_plans
FOR UPDATE TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 管理員可以刪除價格方案
DROP POLICY IF EXISTS "pricing_plans_admin_delete" ON public.pricing_plans;
CREATE POLICY "pricing_plans_admin_delete" ON public.pricing_plans
FOR DELETE TO authenticated
USING (public.is_admin());

-- ===== 輔助函數 =====

-- 計算用戶的有效訂閱結束日期（考慮試用期 + 推薦獎勵 + 付費訂閱）
CREATE OR REPLACE FUNCTION public.get_subscription_end_date(p_user_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_sub RECORD;
  v_end_date TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_sub FROM public.subscriptions WHERE user_id = p_user_id;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- 如果有付費訂閱結束日期，以此為準
  IF v_sub.subscription_end_at IS NOT NULL THEN
    v_end_date := v_sub.subscription_end_at;
  ELSIF v_sub.trial_end_at IS NOT NULL THEN
    v_end_date := v_sub.trial_end_at;
  ELSE
    -- 預設試用 30 天
    v_end_date := v_sub.trial_start_at + INTERVAL '30 days';
  END IF;
  
  -- 加上推薦獎勵天數
  v_end_date := v_end_date + (v_sub.referral_bonus_days || ' days')::INTERVAL;
  
  RETURN v_end_date;
END;
$$;

-- 檢查用戶訂閱是否有效
CREATE OR REPLACE FUNCTION public.is_subscription_active(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_end_date TIMESTAMPTZ;
BEGIN
  v_end_date := public.get_subscription_end_date(p_user_id);
  
  IF v_end_date IS NULL THEN
    RETURN FALSE;
  END IF;
  
  RETURN v_end_date > now();
END;
$$;

-- 計算推薦獎勵天數（每推薦 1 人 = 30 天）
CREATE OR REPLACE FUNCTION public.calculate_referral_bonus(p_referral_count INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- 每推薦 1 人給 30 天
  RETURN p_referral_count * 30;
END;
$$;

-- 更新用戶的推薦獎勵
CREATE OR REPLACE FUNCTION public.update_referral_bonus(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_referral_count INTEGER;
  v_bonus_days INTEGER;
BEGIN
  -- 計算推薦人數
  SELECT COUNT(*) INTO v_referral_count
  FROM public.referrals
  WHERE referrer_user_id = p_user_id;
  
  -- 計算獎勵天數
  v_bonus_days := public.calculate_referral_bonus(v_referral_count);
  
  -- 更新訂閱記錄
  UPDATE public.subscriptions
  SET 
    referral_bonus_days = v_bonus_days,
    last_referral_check = v_referral_count,
    updated_at = now()
  WHERE user_id = p_user_id;
END;
$$;

-- 建立新用戶訂閱（註冊時自動呼叫）
CREATE OR REPLACE FUNCTION public.create_user_subscription(p_user_id UUID, p_referrer_id UUID DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_subscription_id UUID;
  v_trial_end TIMESTAMPTZ;
BEGIN
  -- 計算試用結束日期（30 天後）
  v_trial_end := now() + INTERVAL '30 days';
  
  -- 建立訂閱記錄
  INSERT INTO public.subscriptions (user_id, status, trial_start_at, trial_end_at)
  VALUES (p_user_id, 'trial', now(), v_trial_end)
  ON CONFLICT (user_id) DO NOTHING
  RETURNING id INTO v_subscription_id;
  
  -- 如果有推薦人，記錄推薦關係
  IF p_referrer_id IS NOT NULL AND p_referrer_id != p_user_id THEN
    INSERT INTO public.referrals (referrer_user_id, referred_user_id)
    VALUES (p_referrer_id, p_user_id)
    ON CONFLICT (referred_user_id) DO NOTHING;
    
    -- 更新推薦人的獎勵
    PERFORM public.update_referral_bonus(p_referrer_id);
  END IF;
  
  RETURN v_subscription_id;
END;
$$;

-- 手動延長訂閱（管理員用）
CREATE OR REPLACE FUNCTION public.extend_subscription(
  p_user_id UUID,
  p_days INTEGER,
  p_reason TEXT,
  p_admin_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_end TIMESTAMPTZ;
BEGIN
  -- 取得目前的結束日期
  v_current_end := public.get_subscription_end_date(p_user_id);
  
  IF v_current_end IS NULL THEN
    -- 如果沒有訂閱記錄，建立一個
    PERFORM public.create_user_subscription(p_user_id);
    v_current_end := now();
  END IF;
  
  -- 如果已過期，從現在開始計算
  IF v_current_end < now() THEN
    v_current_end := now();
  END IF;
  
  -- 更新訂閱
  UPDATE public.subscriptions
  SET 
    status = 'active',
    subscription_start_at = COALESCE(subscription_start_at, now()),
    subscription_end_at = v_current_end + (p_days || ' days')::INTERVAL,
    extended_by = p_admin_id,
    extend_reason = p_reason,
    extended_at = now(),
    updated_at = now()
  WHERE user_id = p_user_id;
  
  -- 確保名片可見
  UPDATE public.cards
  SET is_visible = true
  WHERE user_id = p_user_id;
  
  RETURN TRUE;
END;
$$;

-- 檢查並更新過期訂閱（定時任務呼叫）
CREATE OR REPLACE FUNCTION public.check_expired_subscriptions()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  -- 更新過期的訂閱狀態
  UPDATE public.subscriptions
  SET status = 'expired', updated_at = now()
  WHERE status IN ('trial', 'active')
    AND public.get_subscription_end_date(user_id) < now();
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  -- 隱藏過期用戶的名片
  UPDATE public.cards c
  SET is_visible = false
  FROM public.subscriptions s
  WHERE c.user_id = s.user_id
    AND s.status = 'expired'
    AND c.is_visible = true;
  
  RETURN v_count;
END;
$$;

-- 修改通訊錄查詢政策：只顯示可見的名片
DROP POLICY IF EXISTS "cards_directory_select" ON public.cards;
CREATE POLICY "cards_directory_select" ON public.cards
FOR SELECT TO authenticated
USING (is_visible = true OR user_id = auth.uid() OR public.is_admin());

-- ===== 定時任務設定 (Cron Job) =====
-- 用途：每日自動檢查過期訂閱並隱藏名片
-- 注意：需要先啟用 pg_cron 擴展（在 Supabase Dashboard > Database > Extensions 中啟用）

-- 啟用 pg_cron 擴展（如尚未啟用）
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 設定每日 00:00 (UTC) 執行過期檢查
-- SELECT cron.schedule(
--   'daily-check-expired-subscriptions',  -- 任務名稱
--   '0 0 * * *',                           -- Cron 表達式：每日 00:00
--   $$SELECT public.check_expired_subscriptions()$$
-- );

-- 查看已排程的任務
-- SELECT * FROM cron.job;

-- 查看任務執行記錄
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;

-- 刪除定時任務（如需移除）
-- SELECT cron.unschedule('daily-check-expired-subscriptions');

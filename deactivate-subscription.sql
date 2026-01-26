-- ===== 停用訂閱功能 =====
-- 用途：修復 RLS 政策並新增停用/重新啟用訂閱功能

-- ============================================
-- 1. 修復 cards 表的公開讀取 RLS 政策
-- ============================================
-- 問題：目前 cards_public_select 政策允許所有人讀取所有名片
-- 解決：加入 is_visible 檢查，停用的名片無法被外部讀取

-- 先刪除現有的 cards SELECT 政策
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' 
      AND tablename = 'cards'
      AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.cards;', p.policyname);
  END LOOP;
END $$;

-- 建立新的公開讀取政策：只允許讀取可見的名片
CREATE POLICY "cards_public_select" ON public.cards
FOR SELECT
USING (
  is_visible = true           -- 名片必須可見
  OR user_id::text = auth.uid()::text     -- 或是自己的名片
  OR public.is_admin()        -- 或是管理員
);

-- ============================================
-- 2. 新增停用訂閱函數
-- ============================================
CREATE OR REPLACE FUNCTION public.deactivate_subscription(
  p_user_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 檢查是否為管理員（使用 SECURITY DEFINER 繞過 RLS）
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: not an admin';
  END IF;

  -- 更新訂閱狀態為 cancelled
  UPDATE public.subscriptions
  SET 
    status = 'cancelled',
    extend_reason = COALESCE(p_reason, '管理員手動停用'),
    extended_by = auth.uid(),
    extended_at = now(),
    updated_at = now()
  WHERE user_id = p_user_id;
  
  -- 如果沒有訂閱記錄，建立一個 cancelled 狀態的記錄
  IF NOT FOUND THEN
    INSERT INTO public.subscriptions (
      user_id, 
      status, 
      extend_reason, 
      extended_by, 
      extended_at
    ) VALUES (
      p_user_id, 
      'cancelled', 
      COALESCE(p_reason, '管理員手動停用'),
      auth.uid(),
      now()
    );
  END IF;
  
  -- 隱藏名片
  UPDATE public.cards
  SET is_visible = false
  WHERE user_id = p_user_id;
  
  RETURN TRUE;
END;
$$;

-- ============================================
-- 3. 新增重新啟用訂閱函數
-- ============================================
CREATE OR REPLACE FUNCTION public.reactivate_subscription(
  p_user_id UUID,
  p_days INTEGER DEFAULT 30,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_end TIMESTAMPTZ;
BEGIN
  -- 檢查是否為管理員
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: not an admin';
  END IF;

  -- 計算新的結束日期（從現在開始）
  v_new_end := now() + (p_days || ' days')::INTERVAL;

  -- 更新訂閱狀態為 active
  UPDATE public.subscriptions
  SET 
    status = 'active',
    subscription_start_at = COALESCE(subscription_start_at, now()),
    subscription_end_at = v_new_end,
    extend_reason = COALESCE(p_reason, '管理員重新啟用'),
    extended_by = auth.uid(),
    extended_at = now(),
    updated_at = now()
  WHERE user_id = p_user_id;
  
  -- 如果沒有訂閱記錄，建立一個
  IF NOT FOUND THEN
    INSERT INTO public.subscriptions (
      user_id, 
      status, 
      subscription_start_at,
      subscription_end_at,
      extend_reason, 
      extended_by, 
      extended_at
    ) VALUES (
      p_user_id, 
      'active', 
      now(),
      v_new_end,
      COALESCE(p_reason, '管理員重新啟用'),
      auth.uid(),
      now()
    );
  END IF;
  
  -- 顯示名片
  UPDATE public.cards
  SET is_visible = true
  WHERE user_id = p_user_id;
  
  RETURN TRUE;
END;
$$;

-- ============================================
-- 4. 確保 is_visible 欄位存在且有預設值
-- ============================================
DO $$
BEGIN
  -- 確保欄位存在
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'cards' 
      AND column_name = 'is_visible'
  ) THEN
    ALTER TABLE public.cards ADD COLUMN is_visible BOOLEAN DEFAULT true;
  END IF;
  
  -- 將現有 NULL 值設為 true
  UPDATE public.cards SET is_visible = true WHERE is_visible IS NULL;
END $$;

-- ============================================
-- 完成提示
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '停用訂閱功能設定完成！';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE '已修正的 RLS 政策：';
  RAISE NOTICE '  - cards_public_select: 只允許讀取 is_visible = true 的名片';
  RAISE NOTICE '';
  RAISE NOTICE '已新增的函數：';
  RAISE NOTICE '  - deactivate_subscription(user_id, reason): 停用訂閱';
  RAISE NOTICE '  - reactivate_subscription(user_id, days, reason): 重新啟用';
  RAISE NOTICE '';
  RAISE NOTICE '停用後效果：';
  RAISE NOTICE '  - 外部訪客無法讀取停用用戶的名片';
  RAISE NOTICE '  - 用戶自己仍可看到自己的名片';
  RAISE NOTICE '  - 管理員可看到所有名片';
  RAISE NOTICE '';
END $$;

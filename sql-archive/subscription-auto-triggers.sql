-- ===== 訂閱系統自動化觸發器 =====
-- 用途：自動處理新用戶訂閱建立與推薦獎勵更新

-- ============================================
-- 1. 推薦獎勵自動更新觸發器
-- ============================================
-- 當新的推薦記錄建立時，自動更新推薦人的獎勵天數

CREATE OR REPLACE FUNCTION public.trg_update_referrer_bonus()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 更新推薦人的獎勵天數
  PERFORM public.update_referral_bonus(NEW.referrer_user_id);
  RETURN NEW;
END;
$$;

-- 刪除舊觸發器（如存在）
DROP TRIGGER IF EXISTS trg_referrals_after_insert ON public.referrals;

-- 建立觸發器：當新推薦記錄插入後自動執行
CREATE TRIGGER trg_referrals_after_insert
AFTER INSERT ON public.referrals
FOR EACH ROW
EXECUTE FUNCTION public.trg_update_referrer_bonus();

-- ============================================
-- 2. 新用戶自動建立訂閱觸發器
-- ============================================
-- 當新名片建立時，自動為該用戶建立訂閱記錄（30 天試用）

CREATE OR REPLACE FUNCTION public.trg_create_user_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing UUID;
  v_trial_end TIMESTAMPTZ;
BEGIN
  -- 檢查是否已有訂閱記錄
  SELECT id INTO v_existing 
  FROM public.subscriptions 
  WHERE user_id = NEW.user_id;
  
  -- 如果沒有訂閱記錄，自動建立 30 天試用
  IF v_existing IS NULL THEN
    v_trial_end := now() + INTERVAL '30 days';
    
    INSERT INTO public.subscriptions (
      user_id, 
      status, 
      trial_start_at, 
      trial_end_at
    ) VALUES (
      NEW.user_id,
      'trial',
      now(),
      v_trial_end
    );
    
    RAISE NOTICE '✅ 已為用戶 % 自動建立 30 天試用訂閱', NEW.user_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 刪除舊觸發器（如存在）
DROP TRIGGER IF EXISTS trg_cards_create_subscription ON public.cards;

-- 建立觸發器：當新名片插入後自動執行
CREATE TRIGGER trg_cards_create_subscription
AFTER INSERT ON public.cards
FOR EACH ROW
EXECUTE FUNCTION public.trg_create_user_subscription();

-- ============================================
-- 3. 為現有用戶補建訂閱記錄
-- ============================================
-- 一次性執行：為所有有名片但沒有訂閱的用戶建立訂閱

DO $$
DECLARE
  v_user_id UUID;
  v_trial_end TIMESTAMPTZ;
  v_count INTEGER := 0;
BEGIN
  -- 找出所有有名片但沒有訂閱的用戶
  FOR v_user_id IN
    SELECT c.user_id 
    FROM public.cards c
    LEFT JOIN public.subscriptions s ON c.user_id = s.user_id
    WHERE s.id IS NULL
  LOOP
    v_trial_end := now() + INTERVAL '30 days';
    
    INSERT INTO public.subscriptions (
      user_id, 
      status, 
      trial_start_at, 
      trial_end_at
    ) VALUES (
      v_user_id,
      'trial',
      now(),
      v_trial_end
    );
    
    v_count := v_count + 1;
  END LOOP;
  
  RAISE NOTICE '✅ 已為 % 位現有用戶補建訂閱記錄', v_count;
END $$;

-- ============================================
-- 4. 更新所有用戶的推薦獎勵
-- ============================================
-- 一次性執行：重新計算所有推薦人的獎勵天數

DO $$
DECLARE
  v_referrer_id UUID;
  v_count INTEGER := 0;
BEGIN
  -- 找出所有有推薦記錄的用戶
  FOR v_referrer_id IN
    SELECT DISTINCT referrer_user_id 
    FROM public.referrals
  LOOP
    PERFORM public.update_referral_bonus(v_referrer_id);
    v_count := v_count + 1;
  END LOOP;
  
  RAISE NOTICE '✅ 已更新 % 位用戶的推薦獎勵', v_count;
END $$;

-- ============================================
-- 完成提示
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ 訂閱系統自動化設定完成！';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE '已啟用的自動化功能：';
  RAISE NOTICE '  1. 新推薦 → 自動更新推薦人獎勵天數';
  RAISE NOTICE '  2. 新名片 → 自動建立 30 天試用訂閱';
  RAISE NOTICE '';
  RAISE NOTICE '已執行的一次性補救：';
  RAISE NOTICE '  1. 為現有無訂閱用戶補建訂閱記錄';
  RAISE NOTICE '  2. 重新計算所有推薦人的獎勵天數';
  RAISE NOTICE '';
END $$;

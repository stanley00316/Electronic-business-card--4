-- ===== 修復推薦系統 RLS 政策 =====
-- 問題：LINE 登入用戶無法查看自己的推薦成果
-- 原因：RLS 政策使用 auth.uid()，但 LINE 登入的 user_id 格式不相符
-- 解決方案：使用 ::text 轉型確保 UUID 格式正確比對

-- 1. 先刪除現有的 referrals 政策
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'referrals'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.referrals;', p.policyname);
  END LOOP;
END $$;

-- 2. 確保 RLS 已啟用
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- 3. 重新建立 referrals 表的 RLS 政策

-- 用戶可以查看自己推薦的人（我是推薦人）
CREATE POLICY "referrals_own_referrer_select" ON public.referrals
FOR SELECT TO authenticated
USING (referrer_user_id::text = auth.uid()::text);

-- 用戶可以查看誰推薦了自己（我是被推薦人）
CREATE POLICY "referrals_own_referred_select" ON public.referrals
FOR SELECT TO authenticated
USING (referred_user_id::text = auth.uid()::text);

-- 任何登入用戶都可以建立推薦記錄（註冊時自動記錄）
CREATE POLICY "referrals_insert" ON public.referrals
FOR INSERT TO authenticated
WITH CHECK (true);

-- 管理員可以查看所有推薦記錄
CREATE POLICY "referrals_admin_select" ON public.referrals
FOR SELECT TO authenticated
USING (public.is_admin());

-- 4. 驗證政策已建立
DO $$
DECLARE
  policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'referrals';
  
  RAISE NOTICE '已建立 % 個 referrals RLS 政策', policy_count;
END $$;

-- 完成！
-- 執行後，LINE 登入用戶應該可以正確查看推薦成果

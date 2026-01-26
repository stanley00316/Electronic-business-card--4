-- ===== 修復訂閱系統 RLS 政策 =====
-- 問題：LINE 登入的 JWT 沒有 email，導致 is_admin() 總是返回 false
-- 解決方案：更新 is_admin() 同時支援 email (admin_allowlist) 和 user_id (admin_users) 檢查

-- 1. 更新 is_admin() 函數
-- 同時檢查：
-- (a) admin_allowlist 表（透過 email）- 用於 Supabase Auth 或有 email 的 JWT
-- (b) admin_users 表（透過 user_id）- 用於 LINE 登入等自訂 JWT
DROP FUNCTION IF EXISTS public.is_admin();
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    -- 方法 1: 檢查 admin_allowlist (by email)
    EXISTS(
      SELECT 1
      FROM public.admin_allowlist a
      WHERE a.enabled = true
        AND lower(a.email) = public.current_email()
    )
    OR
    -- 方法 2: 檢查 admin_users (by user_id)
    EXISTS(
      SELECT 1
      FROM public.admin_users au
      WHERE au.user_id::text = auth.uid()::text
    );
$$;

-- 2. 確保 subscriptions 表的 RLS 政策使用更新後的 is_admin()
-- 先刪除現有的 subscriptions 政策，避免衝突
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'subscriptions'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.subscriptions;', p.policyname);
  END LOOP;
END $$;

-- 確保 RLS 已啟用
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- 3. 重新建立 subscriptions 表的 RLS 政策

-- 用戶可以查看自己的訂閱
CREATE POLICY "subscriptions_own_select" ON public.subscriptions
FOR SELECT TO authenticated
USING (user_id::text = auth.uid()::text);

-- 用戶可以插入自己的訂閱（註冊時自動建立）
CREATE POLICY "subscriptions_own_insert" ON public.subscriptions
FOR INSERT TO authenticated
WITH CHECK (user_id::text = auth.uid()::text);

-- 用戶可以更新自己的訂閱（推薦獎勵等）
CREATE POLICY "subscriptions_own_update" ON public.subscriptions
FOR UPDATE TO authenticated
USING (user_id::text = auth.uid()::text)
WITH CHECK (user_id::text = auth.uid()::text);

-- 管理員可以查看所有訂閱
CREATE POLICY "subscriptions_admin_select" ON public.subscriptions
FOR SELECT TO authenticated
USING (public.is_admin());

-- 管理員可以更新所有訂閱（手動延長等）
CREATE POLICY "subscriptions_admin_update" ON public.subscriptions
FOR UPDATE TO authenticated
USING (public.is_admin());

-- 管理員可以為任何用戶新增訂閱
CREATE POLICY "subscriptions_admin_insert" ON public.subscriptions
FOR INSERT TO authenticated
WITH CHECK (public.is_admin());

-- 4. 確保 payment_history 表的 RLS 政策也正確
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'payment_history'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.payment_history;', p.policyname);
  END LOOP;
END $$;

ALTER TABLE public.payment_history ENABLE ROW LEVEL SECURITY;

-- 用戶可以查看自己的付款記錄
CREATE POLICY "payment_history_own_select" ON public.payment_history
FOR SELECT TO authenticated
USING (user_id::text = auth.uid()::text);

-- 管理員可以查看所有付款記錄
CREATE POLICY "payment_history_admin_select" ON public.payment_history
FOR SELECT TO authenticated
USING (public.is_admin());

-- 管理員可以插入付款記錄
CREATE POLICY "payment_history_admin_insert" ON public.payment_history
FOR INSERT TO authenticated
WITH CHECK (public.is_admin());

-- 5. 確保 pricing_plans 表的 RLS 政策也正確
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'pricing_plans'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.pricing_plans;', p.policyname);
  END LOOP;
END $$;

ALTER TABLE public.pricing_plans ENABLE ROW LEVEL SECURITY;

-- 所有登入用戶可以查看啟用的價格方案
CREATE POLICY "pricing_plans_authenticated_select" ON public.pricing_plans
FOR SELECT TO authenticated
USING (is_active = true);

-- 管理員可以查看所有價格方案（包含停用的）
CREATE POLICY "pricing_plans_admin_select" ON public.pricing_plans
FOR SELECT TO authenticated
USING (public.is_admin());

-- 管理員可以新增價格方案
CREATE POLICY "pricing_plans_admin_insert" ON public.pricing_plans
FOR INSERT TO authenticated
WITH CHECK (public.is_admin());

-- 管理員可以更新價格方案
CREATE POLICY "pricing_plans_admin_update" ON public.pricing_plans
FOR UPDATE TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 管理員可以刪除價格方案
CREATE POLICY "pricing_plans_admin_delete" ON public.pricing_plans
FOR DELETE TO authenticated
USING (public.is_admin());

-- 6. 更新 admin_allowlist 表的 RLS 政策
-- 使用 SECURITY DEFINER 函數來避免遞迴
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'admin_allowlist'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.admin_allowlist;', p.policyname);
  END LOOP;
END $$;

ALTER TABLE public.admin_allowlist ENABLE ROW LEVEL SECURITY;

-- 所有登入用戶可以讀取 admin_allowlist（用於前端判斷）
-- 使用寬鬆政策，因為 is_admin() 是 SECURITY DEFINER
CREATE POLICY "allowlist_authenticated_select" ON public.admin_allowlist
FOR SELECT TO authenticated
USING (true);

-- 完成提示
DO $$
BEGIN
  RAISE NOTICE '✅ 訂閱系統 RLS 政策修復完成！';
  RAISE NOTICE '   - is_admin() 現在同時支援 email 和 user_id 檢查';
  RAISE NOTICE '   - subscriptions 表 RLS 已更新';
  RAISE NOTICE '   - payment_history 表 RLS 已更新';
  RAISE NOTICE '   - pricing_plans 表 RLS 已更新';
  RAISE NOTICE '   - admin_allowlist 表 RLS 已更新';
END $$;

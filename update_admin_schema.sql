-- 1. 新增 managed_company 欄位
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'admin_users' AND column_name = 'managed_company') THEN
        ALTER TABLE public.admin_users ADD COLUMN managed_company text;
    END IF;
END $$;

-- 2. 強制整理 RLS policies（避免舊 policy 殘留造成遞迴 stack depth）
-- 重要：你遇到的 stack depth limit exceeded (code=54001) 幾乎都是「policy 內查同表」造成無限遞迴。

-- 2-1) admin_users：先把現有 policies 全部刪掉（不靠名字），再重建成「不自我查表」的版本
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'admin_users'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.admin_users;', p.policyname);
  END LOOP;
END $$;

-- 登入者：只能讀自己的 admin row（供前端判斷角色：super/company admin）
CREATE POLICY "admin_users_select_own"
ON public.admin_users
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Super Admin：可讀全部（後台列表用）
-- 注意：這裡用 public.is_admin()（通常查 admin_allowlist），避免在 policy 裡查 admin_users 自己
CREATE POLICY "admin_users_select_all_super"
ON public.admin_users
FOR SELECT
TO authenticated
USING (public.is_admin());

-- Super Admin：可寫入/刪除/更新 admin_users
CREATE POLICY "admin_users_insert_super"
ON public.admin_users
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "admin_users_update_super"
ON public.admin_users
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "admin_users_delete_super"
ON public.admin_users
FOR DELETE
TO authenticated
USING (public.is_admin());

-- 2-2) cards：允許管理員（super/company）更新/刪除；company admin 限制只能操作自己公司
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow update for admins" ON public.cards;
CREATE POLICY "Allow update for admins"
ON public.cards
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.user_id::text = auth.uid()::text
      AND (
        au.managed_company IS NULL
        OR public.cards.company ILIKE ('%' || au.managed_company || '%')
      )
  )
);

DROP POLICY IF EXISTS "Allow delete for admins" ON public.cards;
CREATE POLICY "Allow delete for admins"
ON public.cards
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.user_id::text = auth.uid()::text
      AND (
        au.managed_company IS NULL
        OR public.cards.company ILIKE ('%' || au.managed_company || '%')
      )
  )
);

-- 注意：admin_users 的 policies 已在上方以「全刪再建」處理，避免舊 policy 遺留造成遞迴
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
ALTER TABLE public.admin_users NO FORCE ROW LEVEL SECURITY;

-- 重要：避免任何「policy 內又查 admin_users」的間接路徑造成遞迴。
-- 因此這裡的 super admin 判斷改用 admin_allowlist（不查 admin_users），並用 SECURITY DEFINER 以繞過 allowlist 的 RLS。
drop function if exists public.is_super_admin();
drop function if exists public.is_any_admin();
drop function if exists public.my_managed_company();

create or replace function public.is_super_admin_allowlist()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.admin_allowlist a
    where a.enabled = true
      and lower(a.email) = public.current_email()
  );
$$;

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
USING (user_id::text = auth.uid()::text);

-- Super Admin：可讀全部（後台列表用）
-- 注意：這裡用 allowlist 判斷（不查 admin_users），避免任何遞迴
CREATE POLICY "admin_users_select_all_super"
ON public.admin_users
FOR SELECT
TO authenticated
USING (public.is_super_admin_allowlist());

-- Super Admin：可寫入/刪除/更新 admin_users
CREATE POLICY "admin_users_insert_super"
ON public.admin_users
FOR INSERT
TO authenticated
WITH CHECK (public.is_super_admin_allowlist());

CREATE POLICY "admin_users_update_super"
ON public.admin_users
FOR UPDATE
TO authenticated
USING (public.is_super_admin_allowlist())
WITH CHECK (public.is_super_admin_allowlist());

CREATE POLICY "admin_users_delete_super"
ON public.admin_users
FOR DELETE
TO authenticated
USING (public.is_super_admin_allowlist());

-- 2-2) cards：允許管理員（super/company）更新/刪除；company admin 限制只能操作自己公司
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards NO FORCE ROW LEVEL SECURITY;

-- 先刪除 cards 既有 policies（不靠名字），避免舊 policy 殘留造成遞迴 stack depth
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'cards'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.cards;', p.policyname);
  END LOOP;
END $$;

-- cards：所有人都能讀取（包含未登入訪客，名片才能公開分享）
CREATE POLICY "cards_public_select"
ON public.cards
FOR SELECT
USING (true);

-- cards：使用者自己的資料（僅限寫入/更新/刪除）
CREATE POLICY "cards_own_insert"
ON public.cards
FOR INSERT
TO authenticated
WITH CHECK (user_id::text = auth.uid()::text);

CREATE POLICY "cards_own_update"
ON public.cards
FOR UPDATE
TO authenticated
USING (user_id::text = auth.uid()::text)
WITH CHECK (user_id::text = auth.uid()::text);

CREATE POLICY "cards_own_delete"
ON public.cards
FOR DELETE
TO authenticated
USING (user_id::text = auth.uid()::text);

-- cards：管理員更新/刪除（company admin 限制只能操作自己公司；super admin 不限制）
CREATE POLICY "cards_admin_update"
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
)
WITH CHECK (
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

CREATE POLICY "cards_admin_delete"
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
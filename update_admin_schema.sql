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

-- 若你現有的 public.is_admin() 會查 admin_users，policy 內再呼叫它會造成無限遞迴 → stack depth limit exceeded。
-- 因此這裡改用 SECURITY DEFINER（由 postgres 擁有、繞過 RLS）來判斷 super admin / managed_company。
-- 注意：在 Supabase SQL Editor 以 role=postgres 執行時，函式 owner 會是 postgres，可 bypass RLS。
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.admin_users au
    where au.user_id::text = auth.uid()::text
      and au.managed_company is null
  );
$$;

create or replace function public.is_any_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.admin_users au
    where au.user_id::text = auth.uid()::text
  );
$$;

create or replace function public.my_managed_company()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select au.managed_company
  from public.admin_users au
  where au.user_id::text = auth.uid()::text
  limit 1;
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
-- 注意：不要用 public.is_admin()（你的 DB 可能用它查 admin_users，會遞迴），改用 SECURITY DEFINER 的 public.is_super_admin()
CREATE POLICY "admin_users_select_all_super"
ON public.admin_users
FOR SELECT
TO authenticated
USING (public.is_super_admin());

-- Super Admin：可寫入/刪除/更新 admin_users
CREATE POLICY "admin_users_insert_super"
ON public.admin_users
FOR INSERT
TO authenticated
WITH CHECK (public.is_super_admin());

CREATE POLICY "admin_users_update_super"
ON public.admin_users
FOR UPDATE
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE POLICY "admin_users_delete_super"
ON public.admin_users
FOR DELETE
TO authenticated
USING (public.is_super_admin());

-- 2-2) cards：允許管理員（super/company）更新/刪除；company admin 限制只能操作自己公司
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;

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

-- cards：使用者自己的資料
CREATE POLICY "cards_own_select"
ON public.cards
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "cards_directory_select"
ON public.cards
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "cards_own_insert"
ON public.cards
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "cards_own_update"
ON public.cards
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "cards_own_delete"
ON public.cards
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- cards：管理員更新/刪除（company admin 限制只能操作自己公司；super admin 不限制）
CREATE POLICY "cards_admin_update"
ON public.cards
FOR UPDATE
TO authenticated
USING (
  public.is_any_admin()
  AND (
    public.my_managed_company() IS NULL
    OR public.cards.company ILIKE ('%' || public.my_managed_company() || '%')
  )
)
WITH CHECK (
  public.is_any_admin()
  AND (
    public.my_managed_company() IS NULL
    OR public.cards.company ILIKE ('%' || public.my_managed_company() || '%')
  )
);

CREATE POLICY "cards_admin_delete"
ON public.cards
FOR DELETE
TO authenticated
USING (
  public.is_any_admin()
  AND (
    public.my_managed_company() IS NULL
    OR public.cards.company ILIKE ('%' || public.my_managed_company() || '%')
  )
);

-- 注意：admin_users 的 policies 已在上方以「全刪再建」處理，避免舊 policy 遺留造成遞迴
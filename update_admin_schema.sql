-- 1. 新增 managed_company 欄位
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'admin_users' AND column_name = 'managed_company') THEN
        ALTER TABLE public.admin_users ADD COLUMN managed_company text;
    END IF;
END $$;

-- 2. 設定 RLS (使用 ::text 強制轉型比較)
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

-- 3. 設定 admin_users RLS（避免 policy 自我查表造成 stack depth limit exceeded）
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- 登入者只能讀自己的 admin row（供前端判斷角色）
DROP POLICY IF EXISTS "Allow read own admin row" ON public.admin_users;
CREATE POLICY "Allow read own admin row"
ON public.admin_users
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Super Admin（建議使用 admin_allowlist / public.is_admin()）可讀取全部 admin_users（後台列表用）
DROP POLICY IF EXISTS "Allow read all for super admins" ON public.admin_users;
CREATE POLICY "Allow read all for super admins"
ON public.admin_users
FOR SELECT
TO authenticated
USING (public.is_admin());

-- 4. 設定 Super Admin 寫入權限
DROP POLICY IF EXISTS "Allow insert for super admins" ON public.admin_users;
CREATE POLICY "Allow insert for super admins"
ON public.admin_users
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin()
);

DROP POLICY IF EXISTS "Allow delete for super admins" ON public.admin_users;
CREATE POLICY "Allow delete for super admins"
ON public.admin_users
FOR DELETE
TO authenticated
USING (
  public.is_admin()
);

DROP POLICY IF EXISTS "Allow update for super admins" ON public.admin_users;
CREATE POLICY "Allow update for super admins"
ON public.admin_users
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());
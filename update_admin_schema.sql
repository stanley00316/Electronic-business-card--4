
-- 1. 新增 managed_company 欄位到 admin_users 表 (若不存在)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'admin_users' AND column_name = 'managed_company') THEN
        ALTER TABLE public.admin_users ADD COLUMN managed_company text;
    END IF;
END $$;

-- 2. 確保 RLS 政策允許 Admin 修改與刪除 cards 表
-- 先啟用 cards 表的 RLS (如果還沒的話)
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;

-- 刪除舊的 Admin 相關政策 (避免衝突)
DROP POLICY IF EXISTS "Allow update for admins" ON public.cards;
DROP POLICY IF EXISTS "Allow delete for admins" ON public.cards;

-- 新增政策：允許 admin_users 表中存在的 user_id 對 cards 執行 UPDATE
-- 邏輯：檢查當前 auth.uid() 是否存在於 admin_users 表中
-- (這裡先做簡單的全權管理，細部的 "只能管自己公司" 邏輯會在前端 cloud.js 和 後端 Edge Function/RPC 進一步過濾，
-- 但 RLS 層面我們先開放給 admin_users，以便操作)
CREATE POLICY "Allow update for admins"
ON public.cards
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users 
    WHERE user_id = auth.uid()
  )
);

-- 新增政策：允許 admin_users 表中存在的 user_id 對 cards 執行 DELETE
CREATE POLICY "Allow delete for admins"
ON public.cards
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users 
    WHERE user_id = auth.uid()
  )
);

-- 3. 確保 admin_users 表本身可以被 admin 讀取 (我們之前做過了，這裡再確保一次)
DROP POLICY IF EXISTS "Allow read for authenticated users" ON public.admin_users;
CREATE POLICY "Allow read for authenticated users"
ON public.admin_users
FOR SELECT
TO authenticated
USING (true);

-- 允許 Super Admin (managed_company IS NULL) 管理 admin_users 表 (新增/刪除其他 admin)
-- 這部分需要更嚴謹的政策，這裡先允許 "所有在 admin_users 裡的人" 讀取，但寫入權限我們暫時只開放給 Super Admin
DROP POLICY IF EXISTS "Allow insert for super admins" ON public.admin_users;
CREATE POLICY "Allow insert for super admins"
ON public.admin_users
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.admin_users 
    WHERE user_id = auth.uid() 
    AND managed_company IS NULL -- 只有 Super Admin 可以新增
  )
);

DROP POLICY IF EXISTS "Allow delete for super admins" ON public.admin_users;
CREATE POLICY "Allow delete for super admins"
ON public.admin_users
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users 
    WHERE user_id = auth.uid() 
    AND managed_company IS NULL -- 只有 Super Admin 可以刪除
  )
);

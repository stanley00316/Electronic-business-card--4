-- 允許管理員對 admin_users 表進行新增/修改/刪除操作
-- is_admin() 在 SQL 層確認呼叫者確實是管理員（admin_users 內有該 user_id 的記錄）
DROP POLICY IF EXISTS admin_users_write ON admin_users;
CREATE POLICY admin_users_write ON admin_users
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

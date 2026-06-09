-- 公司設定資料表：儲存各公司的鎖定欄位設定
-- 企業管理員可寫入；員工 (edit.html) 可讀取，以套用鎖定規則
CREATE TABLE IF NOT EXISTS company_settings (
  company_name  TEXT        PRIMARY KEY,
  locked_fields JSONB       NOT NULL DEFAULT '[]',
  updated_by    UUID        REFERENCES auth.users(id),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

-- 管理員可以讀寫所有設定
DROP POLICY IF EXISTS cs_admin_all ON company_settings;
CREATE POLICY cs_admin_all ON company_settings
  FOR ALL USING (is_admin());

-- 已登入用戶可以讀取（edit.html 讀取設定後鎖定欄位）
DROP POLICY IF EXISTS cs_auth_read ON company_settings;
CREATE POLICY cs_auth_read ON company_settings
  FOR SELECT TO authenticated USING (true);

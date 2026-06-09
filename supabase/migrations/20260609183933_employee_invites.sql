-- 員工邀請連結資料表
-- 管理員可建立邀請，員工點連結登入後自動領取並建立名片
CREATE TABLE IF NOT EXISTS card_invites (
  token          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by     UUID        NOT NULL REFERENCES auth.users(id),
  target_company TEXT,
  name           TEXT        NOT NULL,
  title          TEXT,
  department     TEXT,
  email          TEXT,
  phone          TEXT,
  note           TEXT,
  expires_at     TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  used_by        UUID        REFERENCES auth.users(id),
  used_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE card_invites ENABLE ROW LEVEL SECURITY;

-- 管理員可以做所有操作
DROP POLICY IF EXISTS invite_admin_all ON card_invites;
CREATE POLICY invite_admin_all ON card_invites
  FOR ALL USING (is_admin());

-- 任何人可讀取「未使用且未過期」的邀請（用 token 查詢時需要）
DROP POLICY IF EXISTS invite_token_read ON card_invites;
CREATE POLICY invite_token_read ON card_invites
  FOR SELECT TO anon, authenticated
  USING (used_by IS NULL AND expires_at > now());

-- 已登入的用戶可以領取（UPDATE）未使用的邀請，只能設 used_by 為自己
DROP POLICY IF EXISTS invite_claim_update ON card_invites;
CREATE POLICY invite_claim_update ON card_invites
  FOR UPDATE TO authenticated
  USING (used_by IS NULL AND expires_at > now())
  WITH CHECK (used_by = auth.uid());

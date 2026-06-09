-- ============================================================
-- 企業管理系統 Phase 1 遷移
-- 執行方式：貼入 Supabase Dashboard > SQL Editor > Run
-- 全部為 IF NOT EXISTS / OR REPLACE，可安全重複執行
-- ============================================================

-- 1. 員工停用欄位（獨立於訂閱的 is_visible）
ALTER TABLE cards ADD COLUMN IF NOT EXISTS admin_disabled        BOOLEAN     DEFAULT false;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS admin_disabled_by     UUID;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS admin_disabled_at     TIMESTAMPTZ;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS admin_disabled_reason TEXT;

-- 2. NFC 狀態欄位
ALTER TABLE cards ADD COLUMN IF NOT EXISTS nfc_status TEXT DEFAULT 'unbound';

-- 補上 CHECK constraint（若已存在先刪除再加，避免重複執行報錯）
ALTER TABLE cards DROP CONSTRAINT IF EXISTS cards_nfc_status_check;
ALTER TABLE cards ADD CONSTRAINT cards_nfc_status_check
  CHECK (nfc_status IN ('unbound', 'bound', 'disabled', 'lost'));

-- 3. 部門欄位（為後續報表預備）
ALTER TABLE cards ADD COLUMN IF NOT EXISTS department TEXT;

-- ============================================================
-- 4. NFC 綁定時自動同步狀態的 Trigger
-- ============================================================
CREATE OR REPLACE FUNCTION sync_nfc_status()
RETURNS TRIGGER AS $$
BEGIN
  -- nfc_card_id 從無到有 → 狀態自動變 bound（若目前是 unbound）
  IF NEW.nfc_card_id IS NOT NULL AND NEW.nfc_card_id != '' THEN
    IF COALESCE(OLD.nfc_status, 'unbound') = 'unbound' THEN
      NEW.nfc_status := 'bound';
    END IF;
  -- nfc_card_id 從有到無 → 狀態自動變 unbound
  ELSIF (OLD.nfc_card_id IS NOT NULL AND OLD.nfc_card_id != '')
     AND (NEW.nfc_card_id IS NULL OR NEW.nfc_card_id = '') THEN
    NEW.nfc_status := 'unbound';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_nfc_status ON cards;
CREATE TRIGGER trg_sync_nfc_status
  BEFORE UPDATE ON cards
  FOR EACH ROW EXECUTE FUNCTION sync_nfc_status();

-- ============================================================
-- 5. 把已有 nfc_card_id 的名片補上 bound 狀態
-- ============================================================
UPDATE cards
SET nfc_status = 'bound'
WHERE nfc_card_id IS NOT NULL
  AND nfc_card_id != ''
  AND (nfc_status IS NULL OR nfc_status = 'unbound');

-- ============================================================
-- 6. RLS 說明（不修改現有 cards_public_select）
-- 停用名片仍可被公開讀取（is_visible 控制），
-- 由 card.html 前端檢查 admin_disabled 欄位決定顯示停用頁，
-- 這樣 NFC 掃描才能正確導向「此名片已停用」畫面而非空白錯誤。
-- directory.html 在 JS 層過濾 admin_disabled = true 的名片。
-- ============================================================
-- （此區塊不執行任何 SQL，保留現有 policy 不動）

-- ============================================================
-- 7. 允許企業管理員更新 admin_disabled / nfc_status 欄位
--    （現有 cards_admin_update policy 應已涵蓋；此處確保欄位無限制）
-- ============================================================
-- 不需額外 policy，現有 cards_admin_update 允許管理員 UPDATE 整列。

-- ============================================================
-- 完成！請在 Supabase Dashboard 確認 cards 表有以下新欄位：
--   admin_disabled, admin_disabled_by, admin_disabled_at,
--   admin_disabled_reason, nfc_status, department
-- ============================================================

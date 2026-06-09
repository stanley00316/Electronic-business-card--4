-- 企業管理系統 Phase 1 遷移
ALTER TABLE cards ADD COLUMN IF NOT EXISTS admin_disabled        BOOLEAN     DEFAULT false;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS admin_disabled_by     UUID;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS admin_disabled_at     TIMESTAMPTZ;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS admin_disabled_reason TEXT;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS nfc_status            TEXT DEFAULT 'unbound';
ALTER TABLE cards ADD COLUMN IF NOT EXISTS department            TEXT;

ALTER TABLE cards DROP CONSTRAINT IF EXISTS cards_nfc_status_check;
ALTER TABLE cards ADD CONSTRAINT cards_nfc_status_check
  CHECK (nfc_status IN ('unbound', 'bound', 'disabled', 'lost'));

CREATE OR REPLACE FUNCTION sync_nfc_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.nfc_card_id IS NOT NULL AND NEW.nfc_card_id != '' THEN
    IF COALESCE(OLD.nfc_status, 'unbound') = 'unbound' THEN
      NEW.nfc_status := 'bound';
    END IF;
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

UPDATE cards
SET nfc_status = 'bound'
WHERE nfc_card_id IS NOT NULL
  AND nfc_card_id != ''
  AND (nfc_status IS NULL OR nfc_status = 'unbound');

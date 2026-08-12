-- 新增 cards.is_enterprise 欄位：標記此名片是否屬於「已訂購企業方案」的公司
-- 用途：card.html 依此欄位判斷是否顯示公開名片上的「公司驗證資訊」（trust panel）。
-- 個人名片（預設值 false）完全不應顯示公司驗證資訊區塊。
-- 目前寫入方式：由 super admin／企業後台在確認公司完成企業方案訂購後手動或批次設定為 true；
-- 尚未串接自動付款判斷，此欄位僅作為「顯示公司驗證資訊與否」的旗標，不影響其他企業功能鎖定。

ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS is_enterprise BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_cards_is_enterprise ON public.cards(is_enterprise);

COMMENT ON COLUMN public.cards.is_enterprise IS
  '此名片是否屬於已訂購企業方案的公司；僅企業方案名片會在公開名片頁顯示公司驗證資訊（trust panel）。';

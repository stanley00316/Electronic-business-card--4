-- 名片量產貼紙的「製作方式」：PVC（可印製）或 金屬材質（使用水晶貼），以及各自的顏色選項
-- 兩欄都允許 NULL，代表這張名片「尚未設定」貼紙材質/顏色（不影響既有資料）
alter table public.cards
  add column if not exists sticker_material text check (sticker_material in ('pvc', 'metal')),
  add column if not exists sticker_color text check (sticker_color in ('white', 'black', 'silver', 'gold'));

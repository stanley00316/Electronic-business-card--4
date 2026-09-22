-- 使用者自己決定「名片要不要出現在平台通訊錄」。
--
-- 為什麼要新增欄位、不沿用既有的兩個：
--   is_visible      由系統控制（訂閱到期／停用／續訂時自動改）
--   admin_disabled  由管理員控制（人工停用員工名片）
-- 這兩個都不是使用者的意願。若讓使用者的開關去改它們，使用者就能把
-- 訂閱到期被隱藏的名片自己打開、或解除管理員的停用。三者必須各自獨立。
--
-- 預設 true：現有名片維持目前「公開」的行為，不會因為這次變更而突然從通訊錄消失。
-- 關閉後只從通訊錄清單與搜尋消失；拿到直接連結或刷 NFC 的人仍然看得到名片。
alter table public.cards
  add column if not exists directory_visible boolean not null default true;

comment on column public.cards.directory_visible is
  '使用者自選：是否出現在平台通訊錄清單與搜尋。false 只影響通訊錄，不影響直接連結與 NFC。';

-- 通訊錄搜尋會用這個欄位過濾，補一個索引避免名片數量成長後變慢。
create index if not exists cards_directory_visible_idx
  on public.cards (directory_visible)
  where directory_visible = true;

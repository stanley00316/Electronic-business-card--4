create extension if not exists pgcrypto;

-- 管理者白名單
create table if not exists public.admin_allowlist (
  email text primary key,
  enabled boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);

-- 建立超級管理員：請勿把真實 Email 寫死提交進 Git（這個檔案是公開 repo 的一部分）。
-- 初始化資料庫後，請自行到 Supabase Dashboard → SQL Editor 手動執行一次（不要存進版本控制）：
--
--   insert into public.admin_allowlist (email, enabled, note)
--   values ('你的管理員信箱', true, '超級管理員')
--   on conflict (email) do update set enabled = excluded.enabled;

-- helpers：取得 jwt email（Supabase Auth）
create or replace function public.current_email()
returns text
language sql
stable
as $$
  select lower(coalesce(
    nullif(auth.jwt() ->> 'email', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'email', ''),
    nullif(auth.jwt() -> 'app_metadata' ->> 'email', '')
  ));
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists(
    select 1
    from public.admin_allowlist a
    where a.enabled = true
      and lower(a.email) = public.current_email()
  );
$$;

-- 名片主檔：每個 user 一筆（onConflict user_id）
create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  name text,
  phone text,
  email text,
  company text,
  title text,
  theme int default 1,
  profile_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_cards_updated_at on public.cards;
create trigger trg_cards_updated_at
before update on public.cards
for each row execute procedure public.set_updated_at();

-- 通訊錄/好友（每個 owner 可有多筆）
create table if not exists public.directory_contacts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  contact_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_directory_contacts_updated_at on public.directory_contacts;
create trigger trg_directory_contacts_updated_at
before update on public.directory_contacts
for each row execute procedure public.set_updated_at();

-- 同意紀錄
create table if not exists public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  consent_version text not null,
  policy_url text not null,
  consented_at timestamptz not null default now(),
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

-- ===== RLS =====
alter table public.cards enable row level security;
alter table public.directory_contacts enable row level security;
alter table public.consents enable row level security;
alter table public.admin_allowlist enable row level security;

-- 使用者自己的資料
drop policy if exists "cards_own_select" on public.cards;
create policy "cards_own_select" on public.cards
for select to authenticated
using (user_id = auth.uid());

-- 平台通訊錄：登入後可搜尋/查看全平台名片（你要求的「全平台公開搜尋」）
-- 注意：前端仍應只顯示必要欄位；若你之後要「好友制」或「可見欄位更嚴格」，建議改用 view/RPC 控制輸出欄位。
drop policy if exists "cards_directory_select" on public.cards;
create policy "cards_directory_select" on public.cards
for select to authenticated
using (true);

drop policy if exists "cards_own_upsert" on public.cards;
create policy "cards_own_upsert" on public.cards
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "cards_own_update" on public.cards;
create policy "cards_own_update" on public.cards
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "cards_own_delete" on public.cards;
create policy "cards_own_delete" on public.cards
for delete to authenticated
using (user_id = auth.uid());

-- 管理者：全量查詢/刪除（匯出與合規刪除）
drop policy if exists "cards_admin_select" on public.cards;
create policy "cards_admin_select" on public.cards
for select to authenticated
using (public.is_admin());

drop policy if exists "cards_admin_delete" on public.cards;
create policy "cards_admin_delete" on public.cards
for delete to authenticated
using (public.is_admin());

-- directory_contacts：使用者自己的
drop policy if exists "contacts_own_select" on public.directory_contacts;
create policy "contacts_own_select" on public.directory_contacts
for select to authenticated
using (owner_user_id = auth.uid());

drop policy if exists "contacts_own_insert" on public.directory_contacts;
create policy "contacts_own_insert" on public.directory_contacts
for insert to authenticated
with check (owner_user_id = auth.uid());

drop policy if exists "contacts_own_update" on public.directory_contacts;
create policy "contacts_own_update" on public.directory_contacts
for update to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists "contacts_own_delete" on public.directory_contacts;
create policy "contacts_own_delete" on public.directory_contacts
for delete to authenticated
using (owner_user_id = auth.uid());

-- consents：使用者自己的（通常不允許 update/delete，避免竄改同意）
drop policy if exists "consents_own_select" on public.consents;
create policy "consents_own_select" on public.consents
for select to authenticated
using (user_id = auth.uid());

drop policy if exists "consents_own_insert" on public.consents;
create policy "consents_own_insert" on public.consents
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "consents_admin_select" on public.consents;
create policy "consents_admin_select" on public.consents
for select to authenticated
using (public.is_admin());

-- admin_allowlist：只允許管理者讀（前端以 RPC is_admin 判斷，不直接讀表）
drop policy if exists "allowlist_admin_select" on public.admin_allowlist;
create policy "allowlist_admin_select" on public.admin_allowlist
for select to authenticated
using (public.is_admin());

-- ===== Storage：名片圖片（Logo / Avatar）=====
-- Bucket：card-assets
-- - 寫入：只能寫到自己的路徑（{auth.uid()}/...）
-- - 讀取：全平台公開搜尋模式下，登入者可讀取所有人的圖片（authenticated）
-- 注意：Storage 的 RLS 在 storage.objects 上；此段可重複執行（idempotent）insert into storage.buckets (id, name, public)
values ('card-assets', 'card-assets', false)
on conflict (id) do nothing;

-- RLS on storage.objects（通常已開；保險起見）
alter table storage.objects enable row level security;

-- 讀取：登入者可讀取 card-assets 的所有物件（給全平台預覽用）
drop policy if exists "card_assets_read_authenticated" on storage.objects;
create policy "card_assets_read_authenticated" on storage.objects
for select to authenticated
using (bucket_id = 'card-assets');

-- 寫入：只能在自己的資料夾（路徑以 auth.uid() 開頭）
drop policy if exists "card_assets_write_own" on storage.objects;
create policy "card_assets_write_own" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'card-assets'
  and (name like (auth.uid()::text || '/%'))
);

drop policy if exists "card_assets_update_own" on storage.objects;
create policy "card_assets_update_own" on storage.objects
for update to authenticated
using (
  bucket_id = 'card-assets'
  and (name like (auth.uid()::text || '/%'))
)
with check (
  bucket_id = 'card-assets'
  and (name like (auth.uid()::text || '/%'))
);

drop policy if exists "card_assets_delete_own" on storage.objects;
create policy "card_assets_delete_own" on storage.objects
for delete to authenticated
using (
  bucket_id = 'card-assets'
  and (name like (auth.uid()::text || '/%'))
);-- ===== LINE 登入：身份映射表（LINE userId → user_id UUID）=====
-- 用途：在 Supabase Hosted 沒有 LINE Provider 時，仍可透過 Edge Function 簽發 JWT（role=authenticated, sub=user_id）
create table if not exists public.line_identities (
  line_user_id text primary key,
  user_id uuid not null unique,
  display_name text,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

-- 這張表建議只給 service role（Edge Function）維護；一般前端不需直接讀取。

-- ===== 自訂 JWT（LINE 登入）注意事項 =====
-- 若你要用 Edge Function 簽發 JWT 來取代 Supabase Auth provider：
-- 你的使用者 UUID 不會存在 auth.users，因此需要移除外鍵限制。
alter table public.cards drop constraint if exists cards_user_id_fkey;
alter table public.directory_contacts drop constraint if exists directory_contacts_owner_user_id_fkey;
alter table public.consents drop constraint if exists consents_user_id_fkey;

-- ===== 名片瀏覽統計表 =====
-- 用途：追蹤每張名片的瀏覽次數與來源
create table if not exists public.card_views (
  id uuid primary key default gen_random_uuid(),
  card_user_id uuid not null,
  viewed_at timestamptz not null default now(),
  referrer text,
  user_agent text,
  created_at timestamptz not null default now()
);

-- 建立索引以加速查詢
create index if not exists idx_card_views_user_id on public.card_views(card_user_id);
create index if not exists idx_card_views_viewed_at on public.card_views(viewed_at);

-- RLS：允許匿名寫入（記錄瀏覽）、登入用戶可查看自己的統計
alter table public.card_views enable row level security;

-- 任何人（包含匿名）都可以插入瀏覽記錄
drop policy if exists "card_views_anon_insert" on public.card_views;
create policy "card_views_anon_insert" on public.card_views
for insert to anon, authenticated
with check (true);

-- 登入用戶可以查看自己名片的瀏覽記錄
drop policy if exists "card_views_own_select" on public.card_views;
create policy "card_views_own_select" on public.card_views
for select to authenticated
using (card_user_id = auth.uid());

-- 管理員可以查看所有瀏覽記錄
drop policy if exists "card_views_admin_select" on public.card_views;
create policy "card_views_admin_select" on public.card_views
for select to authenticated
using (public.is_admin());

-- ===== NFC 卡片綁定 =====
-- 在 cards 表新增 NFC 卡片 ID 欄位（用於實體 NFC 卡綁定）
alter table public.cards add column if not exists nfc_card_id text unique;

-- 建立索引以加速 NFC ID 查詢
create index if not exists idx_cards_nfc_card_id on public.cards(nfc_card_id);

-- ===== 推薦系統 =====
-- 用途：追蹤用戶推薦關係
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references public.cards(user_id),  -- 推薦人，須為真實會員
  referred_user_id uuid not null references public.cards(user_id), -- 被推薦人，須為真實會員
  created_at timestamptz not null default now(),
  unique(referred_user_id)             -- 每個用戶只能被推薦一次
);

-- 建立索引
create index if not exists idx_referrals_referrer on public.referrals(referrer_user_id);
create index if not exists idx_referrals_referred on public.referrals(referred_user_id);

-- RLS
alter table public.referrals enable row level security;

-- 登入用戶可以查看自己推薦的人
drop policy if exists "referrals_own_select" on public.referrals;
create policy "referrals_own_select" on public.referrals
for select to authenticated
using (referrer_user_id = auth.uid());

-- 登入用戶只能為「自己」建立被推薦紀錄（避免任意灌入他人 UUID 濫刷推薦數）
drop policy if exists "referrals_insert" on public.referrals;
create policy "referrals_insert" on public.referrals
for insert to authenticated
with check (referred_user_id = auth.uid());

-- 管理員可以查看所有推薦記錄
drop policy if exists "referrals_admin_select" on public.referrals;
create policy "referrals_admin_select" on public.referrals
for select to authenticated
using (public.is_admin());
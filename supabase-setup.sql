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

-- ===== 企業分權管理員（company admin）=====
-- 用途：企業版可以指派「只管自己公司」的管理員（managed_company 為 null 代表不限公司，等同 super admin 權限範圍）。
-- 跟上面的 admin_allowlist（超級管理員）是兩套獨立機制：is_admin() 查這張表，
-- is_super_admin_allowlist() 查 admin_allowlist，兩者判斷的「管理員」身份不同、互不取代。
create table if not exists public.admin_users (
  user_id text primary key,
  name text,
  role text default 'org_admin',
  target_company text,
  managed_company text,
  created_at timestamptz default now()
);

alter table public.admin_users enable row level security;
alter table public.admin_users no force row level security;

-- 沿用 update_admin_schema.sql 當初解決 policy 遞迴（stack depth exceeded）的設計：
-- super admin 判斷統一走這個 SECURITY DEFINER 函式，避免 policy 直接回頭查 admin_users 引發遞迴。
-- 同時支援 Email 白名單，以及 LINE 登入使用的「不限公司」管理員記錄。
create or replace function public.is_super_admin_allowlist()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.admin_allowlist a
    where a.enabled = true
      and lower(a.email) = public.current_email()
  ) or exists(
    select 1
    from public.admin_users au
    where au.user_id::text = auth.uid()::text
      and au.managed_company is null
      and au.target_company is null
  );
$$;

grant execute on function public.is_super_admin_allowlist() to authenticated;

-- 一般管理員判斷：admin_allowlist（超級管理員）或 admin_users（company admin）任一有記錄就算。
-- 必須是 security definer + 固定 search_path，才能在自己的 policy 裡查這兩張表而不觸發遞迴/RLS 卡死。
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.admin_allowlist a
    where a.enabled = true
      and lower(a.email) = public.current_email()
  ) or exists(
    select 1
    from public.admin_users au
    where au.user_id::text = auth.uid()::text
  );
$$;

drop policy if exists "admin_users_select_own" on public.admin_users;
create policy "admin_users_select_own" on public.admin_users
for select to authenticated
using (user_id::text = auth.uid()::text);

drop policy if exists "admin_users_select_all_super" on public.admin_users;
create policy "admin_users_select_all_super" on public.admin_users
for select to authenticated
using (public.is_super_admin_allowlist());

drop policy if exists "admin_users_insert_super" on public.admin_users;
create policy "admin_users_insert_super" on public.admin_users
for insert to authenticated
with check (public.is_super_admin_allowlist());

drop policy if exists "admin_users_update_super" on public.admin_users;
create policy "admin_users_update_super" on public.admin_users
for update to authenticated
using (public.is_super_admin_allowlist())
with check (public.is_super_admin_allowlist());

drop policy if exists "admin_users_delete_super" on public.admin_users;
create policy "admin_users_delete_super" on public.admin_users
for delete to authenticated
using (public.is_super_admin_allowlist());

-- 2026-08-27 修正：這裡原本是 admin_users_write（FOR ALL USING/WITH CHECK 都只查 is_admin()），
-- 任何管理員都能任意新增/修改/刪除 admin_users，企業管理員可以把自己的 managed_company 改成 null
-- 自我升級成不限公司的管理員。改成下面這條：企業管理員只能新增/修改/刪除「跟自己同一家公司」的
-- 管理員資料，且新資料的 managed_company／target_company 必須相等、都不能是 null。
-- 超級管理員不受此限制，已由 admin_users_insert_super／update_super／delete_super 涵蓋。
--
-- 注意：查「呼叫者自己的 managed_company」必須包成 SECURITY DEFINER 函式（比照 is_admin()／
-- is_super_admin_allowlist() 的做法），不能直接在 policy 裡查 admin_users 本身，
-- 否則會觸發「政策內查自己表」的無限遞迴（實測驗證過，直接查會整個操作報錯）。
create or replace function public.my_admin_managed_company()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select managed_company
  from public.admin_users
  where user_id = auth.uid()::text
  limit 1;
$$;

drop policy if exists "admin_users_write" on public.admin_users;
drop policy if exists "admin_users_scoped_write" on public.admin_users;
create policy "admin_users_scoped_write" on public.admin_users
for all to authenticated
using (
  public.my_admin_managed_company() is not null
  and public.my_admin_managed_company() = admin_users.managed_company
)
with check (
  managed_company is not null
  and target_company is not null
  and managed_company = target_company
  and public.my_admin_managed_company() is not null
  and public.my_admin_managed_company() = admin_users.managed_company
);

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

-- 名片是否公開可見（訂閱過期/管理員停用時會設為 false）
alter table public.cards add column if not exists is_visible boolean default true;

-- ===== RLS =====
alter table public.cards enable row level security;
alter table public.directory_contacts enable row level security;
alter table public.consents enable row level security;
alter table public.admin_allowlist enable row level security;

-- 公開讀取：is_visible 名片任何人都能看（分享才有意義）；未公開的只有本人/管理員看得到。
-- 2026-08-26 盤點更新：這條規則取代了原本的 cards_own_select／cards_directory_select／cards_admin_select
-- 三條（production 上這三條其實已經不存在，全部被這一條取代，這裡同步成正式環境現況）。
drop policy if exists "cards_own_select" on public.cards;
drop policy if exists "cards_directory_select" on public.cards;
drop policy if exists "cards_admin_select" on public.cards;
drop policy if exists "cards_public_select" on public.cards;
create policy "cards_public_select" on public.cards
for select
using (
  is_visible = true
  or user_id::text = auth.uid()::text
  or public.is_admin()
);

drop policy if exists "cards_own_upsert" on public.cards;
drop policy if exists "cards_own_insert" on public.cards;
create policy "cards_own_insert" on public.cards
for insert to authenticated
with check (user_id::text = auth.uid()::text);

drop policy if exists "cards_own_update" on public.cards;
create policy "cards_own_update" on public.cards
for update to authenticated
using (user_id::text = auth.uid()::text)
with check (user_id::text = auth.uid()::text);

drop policy if exists "cards_own_delete" on public.cards;
create policy "cards_own_delete" on public.cards
for delete to authenticated
using (user_id::text = auth.uid()::text);

-- 管理者：company admin 限制只能操作自己公司（managed_company 為 null 代表不限公司）
drop policy if exists "cards_admin_insert" on public.cards;
create policy "cards_admin_insert" on public.cards
for insert to authenticated
with check (
  exists (
    select 1 from public.admin_users au
    where au.user_id::text = auth.uid()::text
      and (au.managed_company is null or public.cards.company ilike ('%' || au.managed_company || '%'))
  )
);

drop policy if exists "cards_admin_update" on public.cards;
create policy "cards_admin_update" on public.cards
for update to authenticated
using (
  exists (
    select 1 from public.admin_users au
    where au.user_id::text = auth.uid()::text
      and (au.managed_company is null or public.cards.company ilike ('%' || au.managed_company || '%'))
  )
)
with check (
  exists (
    select 1 from public.admin_users au
    where au.user_id::text = auth.uid()::text
      and (au.managed_company is null or public.cards.company ilike ('%' || au.managed_company || '%'))
  )
);

drop policy if exists "cards_admin_delete" on public.cards;
create policy "cards_admin_delete" on public.cards
for delete to authenticated
using (
  exists (
    select 1 from public.admin_users au
    where au.user_id::text = auth.uid()::text
      and (au.managed_company is null or public.cards.company ilike ('%' || au.managed_company || '%'))
  )
);

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
-- 注意：Storage 的 RLS 在 storage.objects 上；此段可重複執行（idempotent）
-- 2026-08-26 修正：這行原本跟上面的註解黏在同一行，導致整句被吃進註解裡、從未真的執行過
-- （bucket 目前是靠正式環境早期手動建立才存在，這裡補上讓腳本本身也能正確建立）。
insert into storage.buckets (id, name, public)
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

-- ===== 訂閱系統：付費、試用、推薦獎勵 =====
-- 2026-08-26 盤點：這段原本只存在於根目錄的 subscription-setup.sql，且部分規則跟正式環境
-- 實際生效的版本不一致，這裡已經對照正式環境查證過，是目前真正生效的版本（不是憑檔案時間猜的）。

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  status text not null default 'trial', -- trial／active／expired／cancelled
  created_at timestamptz not null default now(),
  trial_start_at timestamptz default now(),
  trial_end_at timestamptz,
  subscription_start_at timestamptz,
  subscription_end_at timestamptz,
  referral_bonus_days integer default 0,
  last_referral_check integer default 0,
  payment_provider text,
  payment_id text,
  amount integer,
  currency text default 'TWD',
  extended_by uuid,
  extend_reason text,
  extended_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_subscriptions_user_id on public.subscriptions(user_id);
create index if not exists idx_subscriptions_status on public.subscriptions(status);
create index if not exists idx_subscriptions_trial_end on public.subscriptions(trial_end_at);
create index if not exists idx_subscriptions_subscription_end on public.subscriptions(subscription_end_at);

drop trigger if exists trg_subscriptions_updated_at on public.subscriptions;
create trigger trg_subscriptions_updated_at
before update on public.subscriptions
for each row execute procedure public.set_updated_at();

create table if not exists public.payment_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  subscription_id uuid references public.subscriptions(id),
  payment_provider text not null,
  payment_id text,
  amount integer not null,
  currency text default 'TWD',
  status text not null default 'pending', -- pending／completed／failed／refunded
  period_start timestamptz,
  period_end timestamptz,
  payment_details jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_payment_history_user_id on public.payment_history(user_id);
create index if not exists idx_payment_history_subscription_id on public.payment_history(subscription_id);
create index if not exists idx_payment_history_status on public.payment_history(status);

create table if not exists public.pricing_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_en text,
  description text,
  description_en text,
  price integer not null,
  currency text default 'TWD',
  duration_days integer not null,
  is_active boolean default true,
  sort_order integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_pricing_plans_updated_at on public.pricing_plans;
create trigger trg_pricing_plans_updated_at
before update on public.pricing_plans
for each row execute procedure public.set_updated_at();

insert into public.pricing_plans (name, name_en, description, description_en, price, duration_days, sort_order)
values
  ('月費方案', 'Monthly Plan', '每月訂閱，隨時取消', 'Monthly subscription, cancel anytime', 9900, 30, 1),
  ('季費方案', 'Quarterly Plan', '每季訂閱，享 9 折優惠', 'Quarterly subscription, 10% off', 26700, 90, 2),
  ('年費方案', 'Yearly Plan', '年度訂閱，享 8 折優惠', 'Yearly subscription, 20% off', 95000, 365, 3)
on conflict do nothing;

-- ===== 訂閱系統 RLS =====
alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions_own_select" on public.subscriptions;
create policy "subscriptions_own_select" on public.subscriptions
for select to authenticated
using (user_id::text = auth.uid()::text);

drop policy if exists "subscriptions_own_insert" on public.subscriptions;
create policy "subscriptions_own_insert" on public.subscriptions
for insert to authenticated
with check (user_id::text = auth.uid()::text);

drop policy if exists "subscriptions_own_update" on public.subscriptions;
create policy "subscriptions_own_update" on public.subscriptions
for update to authenticated
using (user_id::text = auth.uid()::text)
with check (user_id::text = auth.uid()::text);

drop policy if exists "subscriptions_admin_select" on public.subscriptions;
create policy "subscriptions_admin_select" on public.subscriptions
for select to authenticated
using (public.is_admin());

drop policy if exists "subscriptions_admin_update" on public.subscriptions;
create policy "subscriptions_admin_update" on public.subscriptions
for update to authenticated
using (public.is_admin());

drop policy if exists "subscriptions_admin_insert" on public.subscriptions;
create policy "subscriptions_admin_insert" on public.subscriptions
for insert to authenticated
with check (public.is_admin());

alter table public.payment_history enable row level security;

-- 注意：這條刻意不用 ::text 轉型（跟 subscriptions_own_select 不同），
-- 2026-08-26 對照正式環境查證過，目前實際生效的就是這個沒轉型的版本。
drop policy if exists "payment_history_own_select" on public.payment_history;
create policy "payment_history_own_select" on public.payment_history
for select to authenticated
using (user_id = auth.uid());

drop policy if exists "payment_history_admin_select" on public.payment_history;
create policy "payment_history_admin_select" on public.payment_history
for select to authenticated
using (public.is_admin());

drop policy if exists "payment_history_admin_insert" on public.payment_history;
create policy "payment_history_admin_insert" on public.payment_history
for insert to authenticated
with check (public.is_admin());

alter table public.pricing_plans enable row level security;

drop policy if exists "pricing_plans_authenticated_select" on public.pricing_plans;
create policy "pricing_plans_authenticated_select" on public.pricing_plans
for select to authenticated
using (is_active = true);

drop policy if exists "pricing_plans_admin_select" on public.pricing_plans;
create policy "pricing_plans_admin_select" on public.pricing_plans
for select to authenticated
using (public.is_admin());

drop policy if exists "pricing_plans_admin_insert" on public.pricing_plans;
create policy "pricing_plans_admin_insert" on public.pricing_plans
for insert to authenticated
with check (public.is_admin());

drop policy if exists "pricing_plans_admin_update" on public.pricing_plans;
create policy "pricing_plans_admin_update" on public.pricing_plans
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "pricing_plans_admin_delete" on public.pricing_plans;
create policy "pricing_plans_admin_delete" on public.pricing_plans
for delete to authenticated
using (public.is_admin());

-- ===== 訂閱系統輔助函式 =====

create or replace function public.get_subscription_end_date(p_user_id uuid)
returns timestamptz
language plpgsql
stable
as $$
declare
  v_sub record;
  v_end_date timestamptz;
begin
  select * into v_sub from public.subscriptions where user_id = p_user_id;
  if not found then
    return null;
  end if;
  if v_sub.subscription_end_at is not null then
    v_end_date := v_sub.subscription_end_at;
  elsif v_sub.trial_end_at is not null then
    v_end_date := v_sub.trial_end_at;
  else
    v_end_date := v_sub.trial_start_at + interval '30 days';
  end if;
  v_end_date := v_end_date + (v_sub.referral_bonus_days || ' days')::interval;
  return v_end_date;
end;
$$;

create or replace function public.is_subscription_active(p_user_id uuid)
returns boolean
language plpgsql
stable
as $$
declare
  v_end_date timestamptz;
begin
  v_end_date := public.get_subscription_end_date(p_user_id);
  if v_end_date is null then
    return false;
  end if;
  return v_end_date > now();
end;
$$;

-- 2026-08-26 對照正式環境查證：實際生效的公式是「每 3 人給 180 天」，
-- 不是根目錄 subscription-setup.sql 寫的「每人 30 天」——後者已經是舊版，這裡以正式環境為準。
create or replace function public.calculate_referral_bonus(p_referral_count integer)
returns integer
language plpgsql
immutable
as $$
begin
  return (p_referral_count / 3) * 180;
end;
$$;

create or replace function public.update_referral_bonus(p_user_id uuid)
returns void
language plpgsql
as $$
declare
  v_referral_count integer;
  v_bonus_days integer;
begin
  select count(*) into v_referral_count
  from public.referrals
  where referrer_user_id = p_user_id;

  v_bonus_days := public.calculate_referral_bonus(v_referral_count);

  update public.subscriptions
  set referral_bonus_days = v_bonus_days,
      last_referral_check = v_referral_count,
      updated_at = now()
  where user_id = p_user_id;
end;
$$;

create or replace function public.create_user_subscription(p_user_id uuid, p_referrer_id uuid default null)
returns uuid
language plpgsql
as $$
declare
  v_subscription_id uuid;
  v_trial_end timestamptz;
begin
  v_trial_end := now() + interval '30 days';

  insert into public.subscriptions (user_id, status, trial_start_at, trial_end_at)
  values (p_user_id, 'trial', now(), v_trial_end)
  on conflict (user_id) do nothing
  returning id into v_subscription_id;

  if p_referrer_id is not null and p_referrer_id != p_user_id then
    insert into public.referrals (referrer_user_id, referred_user_id)
    values (p_referrer_id, p_user_id)
    on conflict (referred_user_id) do nothing;

    perform public.update_referral_bonus(p_referrer_id);
  end if;

  return v_subscription_id;
end;
$$;

create or replace function public.extend_subscription(
  p_user_id uuid,
  p_days integer,
  p_reason text,
  p_admin_id uuid
)
returns boolean
language plpgsql
as $$
declare
  v_current_end timestamptz;
begin
  v_current_end := public.get_subscription_end_date(p_user_id);

  if v_current_end is null then
    perform public.create_user_subscription(p_user_id);
    v_current_end := now();
  end if;

  if v_current_end < now() then
    v_current_end := now();
  end if;

  update public.subscriptions
  set status = 'active',
      subscription_start_at = coalesce(subscription_start_at, now()),
      subscription_end_at = v_current_end + (p_days || ' days')::interval,
      extended_by = p_admin_id,
      extend_reason = p_reason,
      extended_at = now(),
      updated_at = now()
  where user_id = p_user_id;

  update public.cards
  set is_visible = true
  where user_id = p_user_id;

  return true;
end;
$$;

create or replace function public.check_expired_subscriptions()
returns integer
language plpgsql
as $$
declare
  v_count integer := 0;
begin
  update public.subscriptions
  set status = 'expired', updated_at = now()
  where status in ('trial', 'active')
    and public.get_subscription_end_date(user_id) < now();

  get diagnostics v_count = row_count;

  update public.cards c
  set is_visible = false
  from public.subscriptions s
  where c.user_id = s.user_id
    and s.status = 'expired'
    and c.is_visible = true;

  return v_count;
end;
$$;

-- ===== stripe-webhook 防重複處理用的紀錄表 =====
-- 用途：Stripe 逾時或手動重送同一筆事件時，靠這張表判斷是否已經處理過，
-- 避免同一筆付款被重複展延訂閱天數、重複寫入付款紀錄。
-- 只給 service_role 存取，前端一律讀不到（enable RLS 但不建立任何 policy，等於預設拒絕）。
create table if not exists public.processed_webhook_events (
  event_id text primary key,
  provider text not null,
  processed_at timestamptz not null default now()
);

create index if not exists idx_processed_webhook_events_provider
  on public.processed_webhook_events (provider, processed_at);

alter table public.processed_webhook_events enable row level security;

-- ===== guest-card-intake 防洗版：速率限制紀錄表 =====
-- 用途：guest-card-intake 這支免登入公開 Edge Function 用 service_role 直接寫入
-- cards／referrals（繞過 RLS），referrer_user_id 又直接來自使用者送出的表單內容，
-- 完全沒有登入、沒有流量限制。因為每張公開名片網址（card.html?id=<user_id>）本來就
-- 會把 user_id 攤在網址列給任何人看，任何人都能複製一個陌生人的 user_id、填假聯絡
-- 資料、重複呼叫這支公開 API，幫該陌生人（或自己）無限刷推薦獎勵天數，完全不需要登入。
--
-- 這張表只給 Edge Function 的 service_role 寫入/查詢，前端一律讀不到
-- （enable RLS 但不建立任何 policy，等於預設拒絕所有一般查詢，service_role 不受 RLS 限制）。
-- IP 位址雜湊後才存，不留明碼 IP。
create table if not exists public.guest_intake_attempts (
  id uuid primary key default gen_random_uuid(),
  ip_hash text not null,
  referrer_user_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_guest_intake_attempts_ip_time
  on public.guest_intake_attempts (ip_hash, created_at);

create index if not exists idx_guest_intake_attempts_referrer_time
  on public.guest_intake_attempts (referrer_user_id, created_at)
  where referrer_user_id is not null;

alter table public.guest_intake_attempts enable row level security;
-- 刻意不建立任何 policy：預設拒絕所有一般查詢，只有 service_role（Edge Function）能存取。

-- ===== guest_intake_attempts 清理排程用函式 =====
-- 用途：這張表只用來做短時間的流量限制判斷（10 分鐘內／24 小時內的紀錄），
-- 沒有清理機制的話會無限期累積。保留 7 天（遠超過查詢實際會用到的 24 小時），
-- 多留一點緩衝方便事後回頭排查濫用情況，之後由排程每日清掉更舊的紀錄。
create or replace function public.cleanup_guest_intake_attempts()
returns integer
language plpgsql
as $$
declare
  v_count integer := 0;
begin
  delete from public.guest_intake_attempts
  where created_at < now() - interval '7 days';

  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

-- ===== 定時任務設定（Cron Job）=====
-- 用途：每日自動檢查過期訂閱並隱藏名片、清理過期的流量限制紀錄。需要先在
-- Supabase Dashboard → Database → Extensions 啟用 pg_cron，再手動執行下面這段
-- （避免每次重跑 setup 腳本時重複建立排程）：
--
-- select cron.schedule(
--   'daily-check-expired-subscriptions',
--   '0 0 * * *',
--   $$select public.check_expired_subscriptions()$$
-- );
--
-- select cron.schedule(
--   'daily-cleanup-guest-intake-attempts',
--   '0 1 * * *',
--   $$select public.cleanup_guest_intake_attempts()$$
-- );

-- ===== 企業管理系統：員工停用、NFC 狀態、部門欄位 =====
-- 用途：admin.html 的企業後台功能，跟訂閱到期的 is_visible 是獨立的兩件事——
-- admin_disabled 是管理員手動停用某位員工（例如離職），is_visible 是訂閱到期自動隱藏。
-- card.html／directory.html 前端會分別檢查這兩個欄位，顯示不同的提示文字。
alter table public.cards add column if not exists admin_disabled boolean default false;
alter table public.cards add column if not exists admin_disabled_by uuid;
alter table public.cards add column if not exists admin_disabled_at timestamptz;
alter table public.cards add column if not exists admin_disabled_reason text;
alter table public.cards add column if not exists nfc_status text default 'unbound';
alter table public.cards add column if not exists department text;

alter table public.cards drop constraint if exists cards_nfc_status_check;
alter table public.cards add constraint cards_nfc_status_check
  check (nfc_status in ('unbound', 'bound', 'disabled', 'lost'));

-- NFC 卡片綁定/解除時自動同步狀態，不需要前端另外呼叫 API 更新狀態欄位。
create or replace function public.sync_nfc_status()
returns trigger
language plpgsql
as $$
begin
  if new.nfc_card_id is not null and new.nfc_card_id != '' then
    if coalesce(old.nfc_status, 'unbound') = 'unbound' then
      new.nfc_status := 'bound';
    end if;
  elsif (old.nfc_card_id is not null and old.nfc_card_id != '')
     and (new.nfc_card_id is null or new.nfc_card_id = '') then
    new.nfc_status := 'unbound';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_nfc_status on public.cards;
create trigger trg_sync_nfc_status
  before update on public.cards
  for each row execute function public.sync_nfc_status();

-- ===== 訂閱系統自動化：新用戶自動建立試用、推薦獎勵自動更新 =====
-- 用途：避免前端每個進入點都要記得手動呼叫 create_user_subscription／update_referral_bonus，
-- 改成資料庫層用 trigger 自動處理，少一個「忘記呼叫」就出錯的環節。
create or replace function public.trg_update_referrer_bonus()
returns trigger
language plpgsql
security definer
as $$
begin
  perform public.update_referral_bonus(new.referrer_user_id);
  return new;
end;
$$;

drop trigger if exists trg_referrals_after_insert on public.referrals;
create trigger trg_referrals_after_insert
after insert on public.referrals
for each row
execute function public.trg_update_referrer_bonus();

create or replace function public.trg_create_user_subscription()
returns trigger
language plpgsql
security definer
as $$
declare
  v_existing uuid;
  v_trial_end timestamptz;
begin
  select id into v_existing
  from public.subscriptions
  where user_id = new.user_id;

  if v_existing is null then
    v_trial_end := now() + interval '30 days';

    insert into public.subscriptions (
      user_id, status, trial_start_at, trial_end_at
    ) values (
      new.user_id, 'trial', now(), v_trial_end
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_cards_create_subscription on public.cards;
create trigger trg_cards_create_subscription
after insert on public.cards
for each row
execute function public.trg_create_user_subscription();

-- ===== OAuth 身份對照表（Google／Apple 登入）=====
-- 背景：Supabase 官方沒有直接支援「自訂 JWT 登入」，做法比照既有的 LINE 登入——
-- 用一張對照表記住「這個第三方帳號」對應到「我們系統裡的哪個 user_id」，之後
-- Edge Function（google-auth／apple-auth）用這張表簽發跟 LINE 登入一樣格式的 JWT。
-- 這兩張表只給 service role（Edge Function）維護；一般前端不需要直接讀取。
-- 開啟 RLS 且不建立任何政策 = 一律拒絕 anon/authenticated 存取，service_role 依慣例永遠會略過 RLS，
-- 所以 Edge Function 既有的存取行為完全不受影響，純粹多一層防護避免資料表被外部意外讀到。
create table if not exists public.google_identities (
  google_user_id text primary key,
  user_id uuid not null unique,
  email text,
  display_name text,
  picture text,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

alter table public.google_identities enable row level security;

create table if not exists public.apple_identities (
  apple_user_id text primary key,
  user_id uuid not null unique,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

alter table public.apple_identities enable row level security;

-- ===== Storage：管理員代替他人上傳大頭貼／Logo =====
-- 用途：admin.html「編輯」功能（edit.html?adminMode=true）可以改姓名/電話/Email 等欄位，
-- 換照片也需要對應例外，權限範圍跟 cards_admin_update 完全一致：
--   - 超級管理員（managed_company 是空）：任何人的圖片都能傳
--   - 企業管理員（有填公司）：只能傳「自己公司」員工的圖片
drop policy if exists "card_assets_write_admin" on storage.objects;
create policy "card_assets_write_admin" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'card-assets'
  and exists (
    select 1
    from public.admin_users au
    left join public.cards c on c.user_id::text = split_part(storage.objects.name, '/', 1)
    where au.user_id::text = auth.uid()::text
      and (
        au.managed_company is null
        or (c.company is not null and c.company ilike ('%' || au.managed_company || '%'))
      )
  )
);

drop policy if exists "card_assets_update_admin" on storage.objects;
create policy "card_assets_update_admin" on storage.objects
for update to authenticated
using (
  bucket_id = 'card-assets'
  and exists (
    select 1
    from public.admin_users au
    left join public.cards c on c.user_id::text = split_part(storage.objects.name, '/', 1)
    where au.user_id::text = auth.uid()::text
      and (
        au.managed_company is null
        or (c.company is not null and c.company ilike ('%' || au.managed_company || '%'))
      )
  )
)
with check (
  bucket_id = 'card-assets'
  and exists (
    select 1
    from public.admin_users au
    left join public.cards c on c.user_id::text = split_part(storage.objects.name, '/', 1)
    where au.user_id::text = auth.uid()::text
      and (
        au.managed_company is null
        or (c.company is not null and c.company ilike ('%' || au.managed_company || '%'))
      )
  )
);

drop policy if exists "card_assets_delete_admin" on storage.objects;
create policy "card_assets_delete_admin" on storage.objects
for delete to authenticated
using (
  bucket_id = 'card-assets'
  and exists (
    select 1
    from public.admin_users au
    left join public.cards c on c.user_id::text = split_part(storage.objects.name, '/', 1)
    where au.user_id::text = auth.uid()::text
      and (
        au.managed_company is null
        or (c.company is not null and c.company ilike ('%' || au.managed_company || '%'))
      )
  )
);

-- ===== 後台：名片瀏覽統計批次查詢 RPC =====
-- 用途：admin.html 後台一次查多筆名片的瀏覽次數／最後瀏覽時間／NFC 感應次數，
-- 權限範圍跟 cards_admin_* 一致（super admin 看全部，企業管理員限自己公司）。
drop function if exists public.get_card_view_summaries_for_admin(uuid[]);
create or replace function public.get_card_view_summaries_for_admin(p_user_ids uuid[])
returns table (
  user_id uuid,
  open_count bigint,
  last_opened_at timestamptz,
  nfc_scan_count bigint,
  last_nfc_scanned_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  mc text;
begin
  if p_user_ids is null or cardinality(p_user_ids) = 0 then
    return;
  end if;

  if not public.is_admin() then
    raise exception 'PERMISSION_DENIED_NOT_ADMIN' using errcode = '42501';
  end if;

  select managed_company
  into mc
  from public.admin_users au
  where au.user_id::text = auth.uid()::text
  limit 1;

  return query
  select
    v.card_user_id,
    count(*)::bigint,
    max(v.viewed_at),
    count(*) filter (where v.source = 'nfc')::bigint,
    max(v.viewed_at) filter (where v.source = 'nfc')
  from public.card_views v
  inner join public.cards c on c.user_id = v.card_user_id
  where v.card_user_id = any(p_user_ids)
    and (
      mc is null
      or c.company ilike ('%' || mc || '%')
    )
  group by v.card_user_id;
end;
$$;

revoke all on function public.get_card_view_summaries_for_admin(uuid[]) from public;
grant execute on function public.get_card_view_summaries_for_admin(uuid[]) to authenticated;

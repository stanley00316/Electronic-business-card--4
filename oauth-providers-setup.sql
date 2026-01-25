-- ===== OAuth 提供者身份映射表 =====
-- 用於在不依賴 Supabase Auth Provider 的情況下支援多種登入方式
-- 執行此 SQL 前，請先執行 supabase-setup.sql

-- ===== Google 登入：身份映射表（Google userId → user_id UUID）=====
create table if not exists public.google_identities (
  google_user_id text primary key,
  user_id uuid not null unique,
  email text,
  display_name text,
  picture text,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

-- 建立索引以加速 user_id 查詢
create index if not exists idx_google_identities_user_id on public.google_identities(user_id);
create index if not exists idx_google_identities_email on public.google_identities(email);

-- ===== Apple 登入：身份映射表（Apple userId → user_id UUID）=====
create table if not exists public.apple_identities (
  apple_user_id text primary key,
  user_id uuid not null unique,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

-- 建立索引以加速 user_id 查詢
create index if not exists idx_apple_identities_user_id on public.apple_identities(user_id);
create index if not exists idx_apple_identities_email on public.apple_identities(email);

-- ===== 帳號關聯表（可選：用於合併不同登入方式的帳號）=====
-- 當同一個使用者用不同方式登入（LINE、Google、Apple）時，可透過此表關聯
create table if not exists public.linked_accounts (
  id uuid primary key default gen_random_uuid(),
  primary_user_id uuid not null,          -- 主帳號 user_id
  provider text not null,                  -- 'line', 'google', 'apple'
  provider_user_id text not null,          -- 該提供者的 user_id
  email text,
  linked_at timestamptz not null default now(),
  unique(provider, provider_user_id)
);

create index if not exists idx_linked_accounts_primary_user_id on public.linked_accounts(primary_user_id);

-- ===== RLS 政策（這些表通常只由 Edge Function 維護，不開放前端直接存取）=====
-- 如果需要讓 service role 以外的角色存取，可以啟用以下 RLS

-- Google identities: 只允許 service role 存取
alter table public.google_identities enable row level security;

-- Apple identities: 只允許 service role 存取
alter table public.apple_identities enable row level security;

-- Linked accounts: 只允許 service role 存取
alter table public.linked_accounts enable row level security;

-- ===== 說明 =====
-- 1. 這些表由 Edge Function 使用 service_role_key 維護
-- 2. 前端不需要直接存取這些表
-- 3. 登入流程：
--    前端 → OAuth Provider → 取得 code → Edge Function → 換取 token → 查詢/建立 identity → 簽發 JWT → 前端儲存

create extension if not exists pgcrypto;

-- 管理者白名單
create table if not exists public.admin_allowlist (
  email text primary key,
  enabled boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);

-- 你的管理者 email
insert into public.admin_allowlist (email, enabled, note)
values ('Dayseeday1101@gmail.com', true, '管理者')
on conflict (email) do update set enabled = excluded.enabled;

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


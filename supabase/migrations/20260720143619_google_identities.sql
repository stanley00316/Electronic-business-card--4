-- ===== 開放 Google 登入（身份對照表）=====
-- 背景：跟現有的 LINE 登入是一樣的做法——Supabase 官方沒有直接支援「自訂 JWT 登入」，
-- 所以用一張對照表記住「這個 Google 帳號」對應到「我們系統裡的哪個 user_id」，
-- 之後 Edge Function（supabase/functions/google-auth）會用這張表簽發跟 LINE 登入一樣格式的 JWT。

create table if not exists public.google_identities (
  google_user_id text primary key,
  user_id uuid not null unique,
  email text,
  display_name text,
  picture text,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

-- 這張表只給 service role（Edge Function）維護；一般前端不需要直接讀取，不用開 RLS 給 anon/authenticated。

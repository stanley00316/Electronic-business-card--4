-- 資安加固：google_identities 只給 service role（Edge Function）用 service_role_key 存取，
-- 一般網站訪客（anon）、一般登入使用者（authenticated）都不需要、也不應該能直接讀寫這張表。
-- 開啟 RLS 且不建立任何政策 = 一律拒絕 anon/authenticated 存取；service_role 依 Postgres/
-- Supabase 慣例永遠會略過 RLS，所以 Edge Function 既有的存取行為完全不受影響。
alter table public.google_identities enable row level security;

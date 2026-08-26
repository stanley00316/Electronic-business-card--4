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

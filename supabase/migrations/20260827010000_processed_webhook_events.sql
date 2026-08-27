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

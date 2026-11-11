-- 只供獨立測試資料庫使用：所有編號與資料都是假的。
create table public.cards (
  user_id uuid primary key,
  is_enterprise boolean,
  is_visible boolean not null,
  admin_disabled boolean not null default false,
  directory_visible boolean not null default false,
  updated_at timestamptz not null default now() - interval '60 days'
);
create table public.subscriptions (
  user_id uuid primary key,
  status text not null,
  trial_start_at timestamptz default now() - interval '60 days',
  trial_end_at timestamptz,
  subscription_end_at timestamptz,
  referral_bonus_days integer default 0,
  updated_at timestamptz not null default now() - interval '60 days'
);

-- 1～6 是個人，7～15 是企業，16 模擬舊資料缺標記，17 模擬名片不存在。
insert into public.subscriptions(user_id, status, trial_end_at, subscription_end_at, referral_bonus_days)
select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  case when n in (2,8,11) then 'active'
       when n in (3,4,12) then 'expired'
       when n in (5,13) then 'cancelled' else 'trial' end,
  case when n=10 then now() + interval '10 days'
       when n=15 then now()
       when n=9 then null else now() - interval '10 days' end,
  case when n in (2,8) then now() - interval '1 day' else null end,
  case when n=11 then 30 else 0 end
from generate_series(1,17) n;

insert into public.cards(user_id, is_enterprise, is_visible, admin_disabled)
select user_id,
  case when right(user_id::text,2)::int=16 then null else right(user_id::text,2)::int between 7 and 15 end,
  right(user_id::text,2)::int not in (4,5,13),
  right(user_id::text,2)::int in (6,14)
from public.subscriptions where right(user_id::text,2)::int <> 17;

create temp table before_cards as select * from public.cards;
create temp table before_subscriptions as select * from public.subscriptions;

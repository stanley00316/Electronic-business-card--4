-- 個人免費名片不因訂閱試用到期而隱藏；企業仍沿用原本的日期與推薦獎勵計算。
-- 不批次重新公開名片，避免解除管理員的手動取消、停用或隱藏設定。
create or replace function public.check_expired_subscriptions()
returns integer
language plpgsql
as $$
declare
  v_count integer := 0;
begin
  -- 舊有個人訂閱記錄保留供推薦獎勵使用，但不能因此停用免費名片。
  update public.subscriptions s
  set status = 'expired', updated_at = now()
  where s.status in ('trial', 'active')
    and exists (
      select 1 from public.cards c
      where c.user_id = s.user_id and c.is_enterprise is true
    )
    and public.get_subscription_end_date(s.user_id) < now();

  get diagnostics v_count = row_count;

  update public.cards c
  set is_visible = false
  from public.subscriptions s
  where c.user_id = s.user_id
    and c.is_enterprise is true
    and s.status = 'expired'
    and c.is_visible = true;

  return v_count;
end;
$$;

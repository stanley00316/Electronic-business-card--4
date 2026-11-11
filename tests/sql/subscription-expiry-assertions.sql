do $$
declare
  expired_count integer;
begin
  expired_count := public.check_expired_subscriptions();
  if expired_count <> 4 then
    raise exception '應只有四筆企業試用／付費到期，實際為 %', expired_count;
  end if;

  -- 個人、缺少企業標記與不存在的名片，訂閱及公開狀態都不能被排程改寫。
  if exists (
    select 1 from public.cards c join before_cards b using(user_id)
    where b.is_enterprise is not true and to_jsonb(c) <> to_jsonb(b)
  ) or exists (
    select 1 from public.subscriptions s join before_subscriptions b using(user_id)
    where not exists(select 1 from public.cards c where c.user_id=s.user_id and c.is_enterprise is true)
      and to_jsonb(s) <> to_jsonb(b)
  ) then
    raise exception '個人或無名片的訂閱被改動';
  end if;

  -- 企業到期依原規則隱藏；企業舊有 expired 記錄也仍會處理。
  if exists (
    select 1 from public.cards c join public.subscriptions s using(user_id)
    where right(c.user_id::text,2)::int in (7,8,9,12,14)
      and (c.is_visible is not false or s.status <> 'expired')
  ) then
    raise exception '企業到期規則被改動';
  end if;

  -- 未到期、推薦獎勵延長、手動取消、正好等於現在的企業，維持原狀。
  if exists (
    select 1 from public.cards c join before_cards b using(user_id)
    where right(c.user_id::text,2)::int in (10,11,13,15) and to_jsonb(c) <> to_jsonb(b)
  ) or exists (
    select 1 from public.subscriptions s join before_subscriptions b using(user_id)
    where right(s.user_id::text,2)::int in (10,11,13,15) and to_jsonb(s) <> to_jsonb(b)
  ) then
    raise exception '企業未到期或取消記錄被改動';
  end if;

  if exists (
    select 1 from public.cards c join before_cards b using(user_id)
    where c.admin_disabled is distinct from b.admin_disabled
       or c.directory_visible is distinct from b.directory_visible
       or c.is_enterprise is distinct from b.is_enterprise
  ) or exists (
    select 1 from public.subscriptions s join before_subscriptions b using(user_id)
    where (to_jsonb(s) - 'status' - 'updated_at') <> (to_jsonb(b) - 'status' - 'updated_at')
  ) then
    raise exception '到期日、推薦天數、手動停用或通訊錄開關被改動';
  end if;

  if public.check_expired_subscriptions() <> 0 then
    raise exception '重複執行排程不可重複計算到期';
  end if;
  raise notice 'PASS：17 種資料情境，個人免費、企業規則、手動停用與重複執行均通過';
end;
$$;

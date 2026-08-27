-- ===== 簡化：改用單一欄位 managed_company，不再需要 coalesce(managed_company, target_company) =====
-- 背景：admin_users 的 target_company／managed_company 過去可能不同步（見
-- 20260827050000_fix_admin_users_scope_recursion.sql 修復經過），這裡幾處寫法
-- 用 coalesce 保險。現在 admin_users_scoped_write 規則已經強制兩欄一定相等，
-- 不會再有不同步的狀況，改回單純只看 managed_company，跟 cards_admin_* 等其他
-- 規則的寫法一致，減少一種可能造成混淆的寫法。

-- ----- card-assets 管理員 Storage 例外規則 -----
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

-- ----- 後台名片瀏覽統計 RPC -----
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

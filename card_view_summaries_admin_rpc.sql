-- Admin: batch aggregate card_views (open count, last viewed at).
-- Matches frontend semantics: each card open inserts card_views, including owner preview (see getCardPublic trackView).
-- Permission: public.is_admin() (allowlist and/or admin_users per fix-subscription-rls.sql).
-- Company admin: same ILIKE scope as cards_admin_* (managed_company or target_company vs cards.company).
-- Run in Supabase SQL Editor before using rpc get_card_view_summaries_for_admin.

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

  select nullif(trim(both from coalesce(au.target_company, '')), '')
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

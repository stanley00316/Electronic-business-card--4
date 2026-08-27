-- ===== guest_intake_attempts 清理排程 =====
-- 用途：guest_intake_attempts 只用來做短時間的流量限制判斷
-- （guest-card-intake 檢查的是「10 分鐘內」「24 小時內」的紀錄），
-- 但這張表本身沒有任何清理機制，所有紀錄會無限期累積、越長越大，
-- 舊資料早就超過任何查詢會用到的時間範圍，留著只會拖慢查詢、佔用空間。
--
-- 保留 7 天（遠超過流量限制實際會查詢的 24 小時內），多留一點緩衝方便
-- 事後回頭排查濫用情況，之後由排程每日清掉更舊的紀錄。

create or replace function public.cleanup_guest_intake_attempts()
returns integer
language plpgsql
as $$
declare
  v_count integer := 0;
begin
  delete from public.guest_intake_attempts
  where created_at < now() - interval '7 days';

  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

-- 啟用 pg_cron 後（Supabase Dashboard → Database → Extensions），
-- 手動執行下面這段建立每日排程（避免每次重跑 setup 腳本時重複建立）：
--
-- select cron.schedule(
--   'daily-cleanup-guest-intake-attempts',
--   '0 1 * * *',
--   $$select public.cleanup_guest_intake_attempts()$$
-- );

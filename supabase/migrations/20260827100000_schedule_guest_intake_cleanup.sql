-- pg_cron 已在此專案啟用（正式環境已有 daily-check-expired-subscriptions 在跑），
-- 直接建立 guest_intake_attempts 每日清理排程。cron.schedule 用同名 job 呼叫時
-- 是「更新」而非重複建立，這個檔案可安全重複套用。
select cron.schedule(
  'daily-cleanup-guest-intake-attempts',
  '0 1 * * *',
  $$select public.cleanup_guest_intake_attempts()$$
);

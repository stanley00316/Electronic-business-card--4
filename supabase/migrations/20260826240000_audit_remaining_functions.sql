-- ===== 唯讀盤點：其餘要合併進 supabase-setup.sql 的函式，逐一核對正式定義 =====
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'is_super_admin_allowlist', 'current_email', 'set_updated_at',
        'get_subscription_end_date', 'is_subscription_active',
        'calculate_referral_bonus', 'update_referral_bonus',
        'create_user_subscription', 'extend_subscription', 'check_expired_subscriptions'
      )
    ORDER BY p.proname
  LOOP
    RAISE NOTICE '===== % =====', r.proname;
    RAISE NOTICE '%', r.def;
  END LOOP;
END $$;

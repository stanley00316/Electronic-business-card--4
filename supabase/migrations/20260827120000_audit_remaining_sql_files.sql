DO $$
DECLARE r record;
BEGIN
  RAISE NOTICE '===== cards 表相關欄位是否存在 =====';
  FOR r IN
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cards'
      AND column_name IN ('admin_disabled','admin_disabled_by','admin_disabled_at','admin_disabled_reason','nfc_status','department')
    ORDER BY column_name
  LOOP
    RAISE NOTICE '  column=% type=% default=%', r.column_name, r.data_type, r.column_default;
  END LOOP;

  RAISE NOTICE '===== cards_nfc_status_check constraint =====';
  FOR r IN
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'public.cards'::regclass AND conname = 'cards_nfc_status_check'
  LOOP
    RAISE NOTICE '  conname=% def=%', r.conname, r.def;
  END LOOP;

  RAISE NOTICE '===== 觸發器是否存在 =====';
  FOR r IN
    SELECT trigger_name, event_object_table, action_timing, event_manipulation
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
      AND trigger_name IN ('trg_sync_nfc_status','trg_referrals_after_insert','trg_cards_create_subscription')
    ORDER BY trigger_name
  LOOP
    RAISE NOTICE '  trigger=% table=% timing=% event=%', r.trigger_name, r.event_object_table, r.action_timing, r.event_manipulation;
  END LOOP;

  RAISE NOTICE '===== 相關函式目前定義 =====';
  FOR r IN
    SELECT p.proname, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('sync_nfc_status','trg_update_referrer_bonus','trg_create_user_subscription','get_card_view_summaries_for_admin')
    ORDER BY p.proname
  LOOP
    RAISE NOTICE '  ----- % -----', r.proname;
    RAISE NOTICE '%', r.def;
  END LOOP;

  RAISE NOTICE '===== OAuth 身份對照表是否存在 =====';
  FOR r IN
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('google_identities','apple_identities','linked_accounts')
    ORDER BY table_name
  LOOP
    RAISE NOTICE '  table=%', r.table_name;
  END LOOP;

  RAISE NOTICE '===== card-assets 管理員 Storage policy 是否存在 =====';
  FOR r IN
    SELECT policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname IN ('card_assets_write_admin','card_assets_update_admin','card_assets_delete_admin')
    ORDER BY policyname
  LOOP
    RAISE NOTICE '  policy=% cmd=% qual=% with_check=%', r.policyname, r.cmd, r.qual, r.with_check;
  END LOOP;
END $$;

-- ===== 唯讀盤點：is_admin() 目前真正的定義 =====
DO $$
DECLARE r record;
BEGIN
  RAISE NOTICE '===== public.is_admin() 原始碼 =====';
  FOR r IN
    SELECT pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_admin'
  LOOP
    RAISE NOTICE '%', r.def;
  END LOOP;
END $$;

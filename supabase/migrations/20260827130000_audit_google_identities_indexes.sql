DO $$
DECLARE r record;
BEGIN
  RAISE NOTICE '===== google_identities 目前索引 =====';
  FOR r IN
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'google_identities'
    ORDER BY indexname
  LOOP
    RAISE NOTICE '  index=% def=%', r.indexname, r.indexdef;
  END LOOP;
END $$;

-- ===== 唯讀盤點：admin_users 這張表從未被任何 SQL 檔建立過，查它目前實際的完整結構 =====
DO $$
DECLARE c record;
BEGIN
  RAISE NOTICE '===== public.admin_users 目前實際欄位 =====';
  FOR c IN
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'admin_users'
    ORDER BY ordinal_position
  LOOP
    RAISE NOTICE '  % | % | nullable=% | default=%', c.column_name, c.data_type, c.is_nullable, coalesce(c.column_default, '(none)');
  END LOOP;

  RAISE NOTICE '===== admin_users 所有 RLS 規則 =====';
  DECLARE p record;
  BEGIN
    FOR p IN
      SELECT policyname, cmd, qual, with_check
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'admin_users'
      ORDER BY policyname
    LOOP
      RAISE NOTICE '  % (%) USING: % | WITH CHECK: %', p.policyname, p.cmd, coalesce(p.qual, '(none)'), coalesce(p.with_check, '(none)');
    END LOOP;
  END;
END $$;

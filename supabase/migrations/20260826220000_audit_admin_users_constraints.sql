-- ===== 唯讀盤點：admin_users 的主鍵/唯一/外鍵約束與索引 =====
DO $$
DECLARE c record;
BEGIN
  RAISE NOTICE '===== admin_users 約束 =====';
  FOR c IN
    SELECT tc.constraint_type, tc.constraint_name, kcu.column_name,
           ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
    FROM information_schema.table_constraints tc
    LEFT JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    LEFT JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name AND tc.constraint_type = 'FOREIGN KEY'
    WHERE tc.table_schema = 'public' AND tc.table_name = 'admin_users'
  LOOP
    RAISE NOTICE '  % on % (%) -> %.%', c.constraint_type, c.column_name, c.constraint_name, coalesce(c.foreign_table,''), coalesce(c.foreign_column,'');
  END LOOP;

  RAISE NOTICE '===== admin_users 是否有 RLS enable =====';
  FOR c IN
    SELECT relrowsecurity FROM pg_class WHERE relname = 'admin_users' AND relnamespace = 'public'::regnamespace
  LOOP
    RAISE NOTICE '  rowsecurity = %', c.relrowsecurity;
  END LOOP;
END $$;

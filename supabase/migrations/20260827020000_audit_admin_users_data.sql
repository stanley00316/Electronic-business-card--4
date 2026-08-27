-- ===== 唯讀盤點：admin_users 目前實際資料，確認 target_company / managed_company 是否對得上 =====
DO $$
DECLARE r record;
DECLARE total_count integer;
BEGIN
  SELECT count(*) INTO total_count FROM public.admin_users;
  RAISE NOTICE '===== admin_users 總筆數：% =====', total_count;

  FOR r IN
    SELECT user_id, name, role, target_company, managed_company,
           (target_company IS DISTINCT FROM managed_company) AS mismatched
    FROM public.admin_users
    ORDER BY mismatched DESC, user_id
    LIMIT 50
  LOOP
    RAISE NOTICE '  user_id=% name=% role=% target_company=% managed_company=% 對不上=%',
      r.user_id, coalesce(r.name,'(null)'), coalesce(r.role,'(null)'),
      coalesce(r.target_company,'(null)'), coalesce(r.managed_company,'(null)'), r.mismatched;
  END LOOP;
END $$;

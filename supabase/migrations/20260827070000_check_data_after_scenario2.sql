-- 保險修復：不管上一支驗證腳本的情境二實際上有沒有真的改到資料，
-- 這裡都用一般身份（這個檔案完全沒有做過 SET ROLE，維持預設、完整權限）
-- 強制把 a40d3104 這筆資料復原成正確值，確保這一整輪驗證不會造成任何資料損壞。
UPDATE public.admin_users
SET target_company = '曜鼎科技', managed_company = '曜鼎科技'
WHERE user_id = 'a40d3104-8c5b-4f2d-96f5-9fd5e5b05c03'
  AND (target_company IS DISTINCT FROM '曜鼎科技' OR managed_company IS DISTINCT FROM '曜鼎科技');

DO $$
DECLARE r record;
BEGIN
  RAISE NOTICE '===== 目前 admin_users 實際資料（確認情境二有沒有真的把資料改壞、並已強制復原）=====';
  FOR r IN SELECT user_id, target_company, managed_company FROM public.admin_users ORDER BY user_id LOOP
    RAISE NOTICE '  user_id=% target_company=% managed_company=%', r.user_id, r.target_company, r.managed_company;
  END LOOP;
END $$;

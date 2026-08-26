-- ===== 唯讀盤點：印出目前正式環境實際生效的 RLS 規則 =====
-- 用途：根目錄有多份零散的一次性修復 SQL 檔，同一張表、同一個規則名稱在不同檔案
-- 有不同版本，光看 repo 看不出正式環境現在實際生效的是哪一版。這裡只查詢並印出
-- pg_policies 的現況，不改變任何權限規則，執行安全，供整理 sql-archive 前核對用。

DO $$
DECLARE p record;
BEGIN
  RAISE NOTICE '===== cards / subscriptions / payment_history / pricing_plans 目前生效的 RLS 規則 =====';
  FOR p IN
    SELECT tablename, policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('cards', 'subscriptions', 'payment_history', 'pricing_plans')
    ORDER BY tablename, policyname
  LOOP
    RAISE NOTICE '[%] % (%) USING: % | WITH CHECK: %',
      p.tablename, p.policyname, p.cmd, coalesce(p.qual, '(none)'), coalesce(p.with_check, '(none)');
  END LOOP;
END $$;

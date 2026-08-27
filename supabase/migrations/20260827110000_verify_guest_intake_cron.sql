DO $$
DECLARE r record;
BEGIN
  RAISE NOTICE '===== 目前所有 cron 排程 =====';
  FOR r IN SELECT jobname, schedule, active, command FROM cron.job ORDER BY jobname LOOP
    RAISE NOTICE '  jobname=% schedule=% active=% command=%', r.jobname, r.schedule, r.active, r.command;
  END LOOP;
END $$;

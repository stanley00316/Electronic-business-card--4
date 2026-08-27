DO $$
DECLARE
  ext_count integer;
  job_count integer;
  r record;
BEGIN
  SELECT count(*) INTO ext_count FROM pg_extension WHERE extname = 'pg_cron';
  IF ext_count = 0 THEN
    RAISE NOTICE '===== pg_cron 尚未啟用 =====';
  ELSE
    RAISE NOTICE '===== pg_cron 已啟用，目前排程如下 =====';
    FOR r IN SELECT jobname, schedule, active FROM cron.job ORDER BY jobname LOOP
      RAISE NOTICE '  jobname=% schedule=% active=%', r.jobname, r.schedule, r.active;
    END LOOP;
    SELECT count(*) INTO job_count FROM cron.job;
    IF job_count = 0 THEN
      RAISE NOTICE '  （目前沒有任何已建立的排程）';
    END IF;
  END IF;
END $$;

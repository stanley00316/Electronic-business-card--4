-- 企業付費功能 Phase 1：NFC 感應來源、客戶待跟進名單、防詐騙驗證資料基礎
-- 只新增欄位/資料表與 RPC，不刪除、不改既有 cards 資料與 NFC 網址規則。

DROP POLICY IF EXISTS invite_token_read ON public.card_invites;
CREATE POLICY invite_token_read ON public.card_invites
  FOR SELECT TO anon, authenticated
  USING (used_by IS NULL AND used_at IS NULL AND expires_at > now());

ALTER TABLE public.card_views
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'web';

CREATE INDEX IF NOT EXISTS idx_card_views_source ON public.card_views(source);
CREATE INDEX IF NOT EXISTS idx_card_views_card_source_time ON public.card_views(card_user_id, source, viewed_at DESC);

DROP FUNCTION IF EXISTS public.get_card_view_summaries_for_admin(uuid[]);
CREATE OR REPLACE FUNCTION public.get_card_view_summaries_for_admin(p_user_ids uuid[])
RETURNS TABLE (
  user_id uuid,
  open_count bigint,
  last_opened_at timestamptz,
  nfc_scan_count bigint,
  last_nfc_scanned_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mc text;
BEGIN
  IF p_user_ids IS NULL OR cardinality(p_user_ids) = 0 THEN
    RETURN;
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED_NOT_ADMIN' USING ERRCODE = '42501';
  END IF;

  SELECT nullif(trim(both from coalesce(au.target_company, '')), '')
  INTO mc
  FROM public.admin_users au
  WHERE au.user_id::text = auth.uid()::text
  LIMIT 1;

  RETURN QUERY
  SELECT
    v.card_user_id,
    count(*)::bigint AS open_count,
    max(v.viewed_at) AS last_opened_at,
    count(*) FILTER (WHERE v.source = 'nfc')::bigint AS nfc_scan_count,
    max(v.viewed_at) FILTER (WHERE v.source = 'nfc') AS last_nfc_scanned_at
  FROM public.card_views v
  INNER JOIN public.cards c ON c.user_id = v.card_user_id
  WHERE v.card_user_id = any(p_user_ids)
    AND (
      mc IS NULL
      OR c.company ILIKE ('%' || mc || '%')
    )
  GROUP BY v.card_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_card_view_summaries_for_admin(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.get_card_view_summaries_for_admin(uuid[]) TO authenticated;

CREATE TABLE IF NOT EXISTS public.lead_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_user_id uuid NOT NULL,
  customer_name text NOT NULL,
  phone text,
  line text,
  email text,
  need text,
  status text NOT NULL DEFAULT 'new',
  source text NOT NULL DEFAULT 'web',
  note text,
  next_follow_up_at timestamptz,
  contacted_at timestamptz,
  consent_at timestamptz,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_inquiries_status_check CHECK (status IN ('new', 'contacted', 'won', 'invalid'))
);

CREATE INDEX IF NOT EXISTS idx_lead_inquiries_card_user ON public.lead_inquiries(card_user_id);
CREATE INDEX IF NOT EXISTS idx_lead_inquiries_status ON public.lead_inquiries(status);
CREATE INDEX IF NOT EXISTS idx_lead_inquiries_created ON public.lead_inquiries(created_at DESC);

DROP TRIGGER IF EXISTS trg_lead_inquiries_updated_at ON public.lead_inquiries;
CREATE TRIGGER trg_lead_inquiries_updated_at
BEFORE UPDATE ON public.lead_inquiries
FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.lead_inquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_inquiries_public_insert ON public.lead_inquiries;
CREATE POLICY lead_inquiries_public_insert ON public.lead_inquiries
FOR INSERT TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS lead_inquiries_owner_select ON public.lead_inquiries;
CREATE POLICY lead_inquiries_owner_select ON public.lead_inquiries
FOR SELECT TO authenticated
USING (card_user_id = auth.uid());

DROP POLICY IF EXISTS lead_inquiries_owner_update ON public.lead_inquiries;
CREATE POLICY lead_inquiries_owner_update ON public.lead_inquiries
FOR UPDATE TO authenticated
USING (card_user_id = auth.uid())
WITH CHECK (card_user_id = auth.uid());

DROP POLICY IF EXISTS lead_inquiries_admin_select ON public.lead_inquiries;
CREATE POLICY lead_inquiries_admin_select ON public.lead_inquiries
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.admin_users au
    LEFT JOIN public.cards c ON c.user_id = lead_inquiries.card_user_id
    WHERE au.user_id::text = auth.uid()::text
      AND (
        au.target_company IS NULL
        OR c.company ILIKE ('%' || au.target_company || '%')
      )
  )
);

DROP POLICY IF EXISTS lead_inquiries_admin_update ON public.lead_inquiries;
CREATE POLICY lead_inquiries_admin_update ON public.lead_inquiries
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.admin_users au
    LEFT JOIN public.cards c ON c.user_id = lead_inquiries.card_user_id
    WHERE au.user_id::text = auth.uid()::text
      AND (
        au.target_company IS NULL
        OR c.company ILIKE ('%' || au.target_company || '%')
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.admin_users au
    LEFT JOIN public.cards c ON c.user_id = lead_inquiries.card_user_id
    WHERE au.user_id::text = auth.uid()::text
      AND (
        au.target_company IS NULL
        OR c.company ILIKE ('%' || au.target_company || '%')
      )
  )
);

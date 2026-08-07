-- ============ participants ============
CREATE TABLE public.participants (
  gstin TEXT PRIMARY KEY CHECK (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$'),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  legal_name TEXT NOT NULL,
  trade_name TEXT,
  state_code TEXT NOT NULL CHECK (state_code ~ '^[0-9]{2}$'),
  address TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  pincode TEXT NOT NULL DEFAULT '',
  email TEXT,
  phone TEXT,
  endpoint TEXT NOT NULL DEFAULT 'loopback',
  key_id TEXT,
  public_key_jwk JSONB,
  rotated_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  profiles TEXT[] NOT NULL DEFAULT ARRAY['gst-einvoice'],
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX participants_user_idx ON public.participants (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.participants TO authenticated;
GRANT ALL ON public.participants TO service_role;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Directory is readable by signed-in users"
  ON public.participants FOR SELECT TO authenticated USING (true);
CREATE POLICY "Owners insert their participants"
  ON public.participants FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owners update their participants"
  ON public.participants FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owners delete their participants"
  ON public.participants FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Which GSTINs does the caller control? Security definer so document policies
-- do not recurse through participants' own RLS.
CREATE OR REPLACE FUNCTION public.my_gstins()
RETURNS SETOF TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT gstin FROM public.participants WHERE user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_my_gstin(_gstin TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.participants
    WHERE user_id = auth.uid() AND gstin = _gstin
  )
$$;

-- ============ private keys (server only) ============
CREATE TABLE public.participant_private_keys (
  gstin TEXT NOT NULL REFERENCES public.participants(gstin) ON DELETE CASCADE,
  key_id TEXT NOT NULL,
  private_key_jwk JSONB NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (gstin, key_id)
);
GRANT ALL ON public.participant_private_keys TO service_role;
ALTER TABLE public.participant_private_keys ENABLE ROW LEVEL SECURITY;
-- No policies for authenticated/anon: unreachable from the browser by design.

-- ============ canonical documents ============
CREATE TABLE public.canonical_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('ORDER','INVOICE','DISPATCH','GRN','PAYMENT_ADVICE','CREDIT_NOTE')),
  document_number TEXT NOT NULL,
  issue_date DATE NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  seller_gstin TEXT NOT NULL,
  buyer_gstin TEXT NOT NULL,
  seller JSONB NOT NULL,
  buyer JSONB NOT NULL,
  lines JSONB NOT NULL,
  transport JSONB,
  doc_references JSONB,
  payment_terms_days INTEGER NOT NULL DEFAULT 30,
  notes TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','SENT','ACKNOWLEDGED','ACCEPTED','REJECTED','FAILED')),
  direction TEXT NOT NULL DEFAULT 'OUTBOUND' CHECK (direction IN ('OUTBOUND','INBOUND')),
  source TEXT NOT NULL DEFAULT 'composer',
  totals JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX canonical_documents_parties_idx ON public.canonical_documents (seller_gstin, buyer_gstin);
CREATE INDEX canonical_documents_status_idx ON public.canonical_documents (status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.canonical_documents TO authenticated;
GRANT ALL ON public.canonical_documents TO service_role;
ALTER TABLE public.canonical_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parties read their documents"
  ON public.canonical_documents FOR SELECT TO authenticated
  USING (public.is_my_gstin(seller_gstin) OR public.is_my_gstin(buyer_gstin));
CREATE POLICY "Parties create documents they are on"
  ON public.canonical_documents FOR INSERT TO authenticated
  WITH CHECK (public.is_my_gstin(seller_gstin) OR public.is_my_gstin(buyer_gstin));
CREATE POLICY "Parties update their documents"
  ON public.canonical_documents FOR UPDATE TO authenticated
  USING (public.is_my_gstin(seller_gstin) OR public.is_my_gstin(buyer_gstin))
  WITH CHECK (public.is_my_gstin(seller_gstin) OR public.is_my_gstin(buyer_gstin));
CREATE POLICY "Owners delete their drafts"
  ON public.canonical_documents FOR DELETE TO authenticated
  USING (status = 'DRAFT' AND (public.is_my_gstin(seller_gstin) OR public.is_my_gstin(buyer_gstin)));

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER canonical_documents_touch
  BEFORE UPDATE ON public.canonical_documents
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ revisions (append only) ============
CREATE TABLE public.document_revisions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.canonical_documents(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  prev_hash TEXT,
  content_hash TEXT NOT NULL,
  body JSONB NOT NULL,
  author_gstin TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'composer',
  accepted BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, revision)
);
CREATE INDEX document_revisions_doc_idx ON public.document_revisions (document_id);

GRANT SELECT, INSERT ON public.document_revisions TO authenticated;
GRANT ALL ON public.document_revisions TO service_role;
ALTER TABLE public.document_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parties read revisions of their documents"
  ON public.document_revisions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.canonical_documents d
    WHERE d.id = document_id
      AND (public.is_my_gstin(d.seller_gstin) OR public.is_my_gstin(d.buyer_gstin))
  ));
CREATE POLICY "Parties append revisions"
  ON public.document_revisions FOR INSERT TO authenticated
  WITH CHECK (public.is_my_gstin(author_gstin));

-- ============ envelopes ============
CREATE TABLE public.envelopes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.canonical_documents(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('OUTBOUND','INBOUND')),
  from_gstin TEXT NOT NULL,
  to_gstin TEXT NOT NULL,
  action TEXT NOT NULL,
  body_hash TEXT NOT NULL,
  signature TEXT NOT NULL,
  signer_key_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'SENT'
    CHECK (status IN ('DRAFT','SENT','ACKNOWLEDGED','ACCEPTED','REJECTED','FAILED')),
  attempts INTEGER NOT NULL DEFAULT 0,
  transitions JSONB NOT NULL DEFAULT '[]'::jsonb,
  dead_lettered BOOLEAN NOT NULL DEFAULT false,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX envelopes_doc_idx ON public.envelopes (document_id);

GRANT SELECT, INSERT, UPDATE ON public.envelopes TO authenticated;
GRANT ALL ON public.envelopes TO service_role;
ALTER TABLE public.envelopes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parties read their envelopes"
  ON public.envelopes FOR SELECT TO authenticated
  USING (public.is_my_gstin(from_gstin) OR public.is_my_gstin(to_gstin));
CREATE POLICY "Senders create envelopes"
  ON public.envelopes FOR INSERT TO authenticated
  WITH CHECK (public.is_my_gstin(from_gstin));
CREATE POLICY "Parties update their envelopes"
  ON public.envelopes FOR UPDATE TO authenticated
  USING (public.is_my_gstin(from_gstin) OR public.is_my_gstin(to_gstin))
  WITH CHECK (public.is_my_gstin(from_gstin) OR public.is_my_gstin(to_gstin));

-- ============ triple-entry ledger (insert only) ============
CREATE TABLE public.ledger_elements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sequence BIGSERIAL,
  document_id UUID NOT NULL REFERENCES public.canonical_documents(id) ON DELETE RESTRICT,
  document_kind TEXT NOT NULL,
  seller_gstin TEXT NOT NULL,
  buyer_gstin TEXT NOT NULL,
  event_hash TEXT NOT NULL,
  prev_hash TEXT NOT NULL DEFAULT '',
  chain_hash TEXT NOT NULL,
  narrative TEXT NOT NULL,
  debit JSONB NOT NULL,
  credit JSONB NOT NULL,
  tax JSONB NOT NULL DEFAULT '{}'::jsonb,
  signatures JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'PENDING_COUNTERSIGN'
    CHECK (status IN ('PENDING_COUNTERSIGN','MATCHED','DISPUTED','REVERSED')),
  dispute JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ledger_elements_parties_idx ON public.ledger_elements (seller_gstin, buyer_gstin);
CREATE UNIQUE INDEX ledger_elements_event_idx ON public.ledger_elements (event_hash);

-- Insert only. No UPDATE/DELETE grant, and a trigger so even privileged
-- callers cannot mutate history.
GRANT SELECT, INSERT ON public.ledger_elements TO authenticated;
GRANT SELECT, INSERT ON public.ledger_elements TO service_role;
ALTER TABLE public.ledger_elements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parties read their ledger"
  ON public.ledger_elements FOR SELECT TO authenticated
  USING (public.is_my_gstin(seller_gstin) OR public.is_my_gstin(buyer_gstin));
CREATE POLICY "Parties append ledger elements"
  ON public.ledger_elements FOR INSERT TO authenticated
  WITH CHECK (public.is_my_gstin(seller_gstin) OR public.is_my_gstin(buyer_gstin));

CREATE OR REPLACE FUNCTION public.ledger_is_append_only()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'ledger_elements is append-only: % rejected', TG_OP;
END; $$;

CREATE TRIGGER ledger_elements_append_only
  BEFORE UPDATE OR DELETE ON public.ledger_elements
  FOR EACH ROW EXECUTE FUNCTION public.ledger_is_append_only();

-- Countersignature and status transitions happen through this definer function,
-- which writes a NEW element rather than mutating the prior one.
CREATE OR REPLACE FUNCTION public.ledger_chain_head(_gstin TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT chain_hash FROM public.ledger_elements
      WHERE seller_gstin = _gstin OR buyer_gstin = _gstin
      ORDER BY sequence DESC LIMIT 1), '')
$$;

-- ============ external profile submissions ============
CREATE TABLE public.profile_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.canonical_documents(id) ON DELETE CASCADE,
  profile TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SUCCESS','FAILED')),
  reference_number TEXT,
  payload JSONB,
  response JSONB,
  adapter TEXT NOT NULL DEFAULT 'mock',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX profile_submissions_doc_idx ON public.profile_submissions (document_id);

GRANT SELECT, INSERT, UPDATE ON public.profile_submissions TO authenticated;
GRANT ALL ON public.profile_submissions TO service_role;
ALTER TABLE public.profile_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parties read their submissions"
  ON public.profile_submissions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.canonical_documents d
    WHERE d.id = document_id
      AND (public.is_my_gstin(d.seller_gstin) OR public.is_my_gstin(d.buyer_gstin))
  ));
CREATE POLICY "Parties create their submissions"
  ON public.profile_submissions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.canonical_documents d
    WHERE d.id = document_id
      AND (public.is_my_gstin(d.seller_gstin) OR public.is_my_gstin(d.buyer_gstin))
  ));
CREATE POLICY "Parties update their submissions"
  ON public.profile_submissions FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.canonical_documents d
    WHERE d.id = document_id
      AND (public.is_my_gstin(d.seller_gstin) OR public.is_my_gstin(d.buyer_gstin))
  ))
  WITH CHECK (true);
CREATE TABLE public.ledger_signatures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  element_id UUID NOT NULL REFERENCES public.ledger_elements(id) ON DELETE RESTRICT,
  gstin TEXT NOT NULL,
  signature TEXT NOT NULL,
  key_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (element_id, gstin)
);
CREATE INDEX ledger_signatures_element_idx ON public.ledger_signatures (element_id);

GRANT SELECT, INSERT ON public.ledger_signatures TO authenticated;
GRANT SELECT, INSERT ON public.ledger_signatures TO service_role;
ALTER TABLE public.ledger_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parties read signatures on their elements"
  ON public.ledger_signatures FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ledger_elements e
    WHERE e.id = element_id
      AND (public.is_my_gstin(e.seller_gstin) OR public.is_my_gstin(e.buyer_gstin))
  ));
CREATE POLICY "Parties sign as themselves"
  ON public.ledger_signatures FOR INSERT TO authenticated
  WITH CHECK (public.is_my_gstin(gstin) AND EXISTS (
    SELECT 1 FROM public.ledger_elements e
    WHERE e.id = element_id AND (e.seller_gstin = gstin OR e.buyer_gstin = gstin)
  ));

CREATE TRIGGER ledger_signatures_append_only
  BEFORE UPDATE OR DELETE ON public.ledger_signatures
  FOR EACH ROW EXECUTE FUNCTION public.ledger_is_append_only();

CREATE TABLE public.ledger_disputes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  element_id UUID NOT NULL REFERENCES public.ledger_elements(id) ON DELETE RESTRICT,
  raised_by TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ledger_disputes_element_idx ON public.ledger_disputes (element_id);

GRANT SELECT, INSERT ON public.ledger_disputes TO authenticated;
GRANT SELECT, INSERT ON public.ledger_disputes TO service_role;
ALTER TABLE public.ledger_disputes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parties read disputes on their elements"
  ON public.ledger_disputes FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ledger_elements e
    WHERE e.id = element_id
      AND (public.is_my_gstin(e.seller_gstin) OR public.is_my_gstin(e.buyer_gstin))
  ));
CREATE POLICY "Parties raise disputes as themselves"
  ON public.ledger_disputes FOR INSERT TO authenticated
  WITH CHECK (public.is_my_gstin(raised_by));

CREATE TRIGGER ledger_disputes_append_only
  BEFORE UPDATE OR DELETE ON public.ledger_disputes
  FOR EACH ROW EXECUTE FUNCTION public.ledger_is_append_only();
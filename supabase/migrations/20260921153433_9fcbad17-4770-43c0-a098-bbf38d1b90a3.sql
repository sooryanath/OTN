CREATE SCHEMA IF NOT EXISTS private;

ALTER FUNCTION public.is_my_gstin(TEXT) SET SCHEMA private;
ALTER FUNCTION public.ledger_chain_head(TEXT) SET SCHEMA private;

GRANT USAGE ON SCHEMA private TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_my_gstin(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.ledger_chain_head(TEXT) TO authenticated, service_role;
REVOKE ALL ON FUNCTION private.is_my_gstin(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.ledger_chain_head(TEXT) FROM PUBLIC, anon;

CREATE POLICY "Private keys are never available through the browser"
  ON public.participant_private_keys FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);
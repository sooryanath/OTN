DROP FUNCTION IF EXISTS public.my_gstins();

REVOKE ALL ON FUNCTION public.is_my_gstin(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ledger_chain_head(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_my_gstin(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ledger_chain_head(TEXT) TO authenticated, service_role;
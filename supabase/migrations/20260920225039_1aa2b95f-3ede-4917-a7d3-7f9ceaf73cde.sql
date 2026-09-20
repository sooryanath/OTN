CREATE TABLE public.zoho_books_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  gstin TEXT NOT NULL REFERENCES public.participants(gstin) ON DELETE CASCADE,
  organization_id TEXT NOT NULL,
  organization_name TEXT NOT NULL,
  data_center TEXT NOT NULL DEFAULT 'in',
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  access_token_expires_at TIMESTAMPTZ NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  status TEXT NOT NULL DEFAULT 'CONNECTED' CHECK (status IN ('CONNECTED', 'DISCONNECTED', 'ERROR')),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, gstin)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.zoho_books_connections TO authenticated;
GRANT ALL ON public.zoho_books_connections TO service_role;
ALTER TABLE public.zoho_books_connections ENABLE ROW LEVEL SECURITY;
CREATE INDEX zoho_books_connections_user_idx ON public.zoho_books_connections (user_id);
CREATE INDEX zoho_books_connections_gstin_idx ON public.zoho_books_connections (gstin);
CREATE POLICY "Owners read their Zoho connections"
  ON public.zoho_books_connections FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_my_gstin(gstin));
CREATE POLICY "Owners create their Zoho connections"
  ON public.zoho_books_connections FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_my_gstin(gstin));
CREATE POLICY "Owners update their Zoho connections"
  ON public.zoho_books_connections FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.is_my_gstin(gstin))
  WITH CHECK (user_id = auth.uid() AND public.is_my_gstin(gstin));
CREATE POLICY "Owners delete their Zoho connections"
  ON public.zoho_books_connections FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND public.is_my_gstin(gstin));
CREATE TRIGGER zoho_books_connections_touch
  BEFORE UPDATE ON public.zoho_books_connections
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.zoho_books_sync_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  gstin TEXT NOT NULL REFERENCES public.participants(gstin) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.canonical_documents(id) ON DELETE CASCADE,
  resource TEXT NOT NULL,
  zoho_record_id TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SYNCED', 'FAILED')),
  provider_status TEXT,
  error_message TEXT,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, resource)
);
GRANT SELECT, INSERT, UPDATE ON public.zoho_books_sync_records TO authenticated;
GRANT ALL ON public.zoho_books_sync_records TO service_role;
ALTER TABLE public.zoho_books_sync_records ENABLE ROW LEVEL SECURITY;
CREATE INDEX zoho_books_sync_records_user_idx ON public.zoho_books_sync_records (user_id);
CREATE INDEX zoho_books_sync_records_document_idx ON public.zoho_books_sync_records (document_id);
CREATE POLICY "Owners read their Zoho sync records"
  ON public.zoho_books_sync_records FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_my_gstin(gstin));
CREATE POLICY "Owners create their Zoho sync records"
  ON public.zoho_books_sync_records FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_my_gstin(gstin));
CREATE POLICY "Owners update their Zoho sync records"
  ON public.zoho_books_sync_records FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.is_my_gstin(gstin))
  WITH CHECK (user_id = auth.uid() AND public.is_my_gstin(gstin));
CREATE TRIGGER zoho_books_sync_records_touch
  BEFORE UPDATE ON public.zoho_books_sync_records
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
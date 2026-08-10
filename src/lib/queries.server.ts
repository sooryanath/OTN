import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { rowToCanonical, type DocumentRow } from "@/lib/canonical/mapper";
import { computeTotals } from "@/lib/canonical/totals";
import type { CanonicalDocument } from "@/lib/canonical/types";
import { deriveStatus, verifyChain } from "@/lib/ledger/element";

/**
 * Read models. Everything a screen needs is assembled here, on the server, so
 * the UI never reasons about column names or derives ledger state itself.
 */

async function myGstins(userId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("participants")
    .select("gstin")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.gstin);
}

export async function listParticipants(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("participants")
    .select("gstin, legal_name, trade_name, state_code, city, key_id, endpoint, profiles")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Every registered participant on this node — the discovery catalogue. */
export async function listDirectory() {
  const { data, error } = await supabaseAdmin
    .from("participants")
    .select("gstin, legal_name, state_code, city, endpoint, profiles")
    .order("legal_name", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type DocumentSummary = {
  id: string;
  kind: string;
  documentNumber: string;
  issueDate: string;
  status: string;
  direction: string;
  sellerName: string;
  buyerName: string;
  sellerGstin: string;
  buyerGstin: string;
  grandTotal: number;
  contentHash: string;
  revision: number;
};

function summarise(row: DocumentRow): DocumentSummary {
  const doc = rowToCanonical(row);
  const totals = computeTotals(doc);
  return {
    id: doc.id,
    kind: doc.kind,
    documentNumber: doc.documentNumber,
    issueDate: doc.issueDate,
    status: row.status,
    direction: row.direction,
    sellerName: doc.seller.legalName,
    buyerName: doc.buyer.legalName,
    sellerGstin: doc.seller.gstin,
    buyerGstin: doc.buyer.gstin,
    grandTotal: totals.grandTotal,
    contentHash: doc.contentHash,
    revision: doc.revision,
  };
}

export async function listDocuments(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("canonical_documents")
    .select("*")
    .eq("created_by", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data as DocumentRow[]).map(summarise);
}

export async function getDocument(userId: string, documentId: string) {
  const { data, error } = await supabaseAdmin
    .from("canonical_documents")
    .select("*")
    .eq("id", documentId)
    .eq("created_by", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Document not found");

  const row = data as DocumentRow;
  const doc: CanonicalDocument = rowToCanonical(row);

  const { data: envelopes } = await supabaseAdmin
    .from("envelopes")
    .select("id, direction, action, status, from_gstin, to_gstin, body_hash, signature, signer_key_id, created_at")
    .eq("document_id", documentId)
    .order("created_at", { ascending: true });

  return {
    document: doc,
    status: row.status,
    direction: row.direction,
    totals: computeTotals(doc),
    envelopes: envelopes ?? [],
  };
}

export type LedgerEntry = {
  id: string;
  sequence: number;
  narrative: string;
  documentKind: string;
  sellerGstin: string;
  buyerGstin: string;
  amount: number;
  taxTotal: number;
  eventHash: string;
  prevHash: string;
  chainHash: string;
  signers: string[];
  status: string;
  createdAt: string;
};

/** The shared journal for the caller's GSTINs, with status derived from signatures. */
export async function listLedger(userId: string) {
  const gstins = await myGstins(userId);
  if (gstins.length === 0) return { entries: [] as LedgerEntry[], chainOk: true };

  const filter = gstins.map((g) => `seller_gstin.eq.${g},buyer_gstin.eq.${g}`).join(",");
  const { data, error } = await supabaseAdmin
    .from("ledger_elements")
    .select("*")
    .or(filter)
    .order("sequence", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const ids = rows.map((r) => r.id);

  const [{ data: sigs }, { data: disputes }] = await Promise.all([
    supabaseAdmin.from("ledger_signatures").select("element_id, gstin").in("element_id", ids),
    supabaseAdmin.from("ledger_disputes").select("element_id").in("element_id", ids),
  ]);

  const disputed = new Set((disputes ?? []).map((d) => d.element_id));

  const entries: LedgerEntry[] = rows.map((row) => {
    const signers = (sigs ?? []).filter((s) => s.element_id === row.id).map((s) => s.gstin);
    const debit = row.debit as { amount?: number } | null;
    const tax = row.tax as { total?: number } | null;
    return {
      id: row.id,
      sequence: row.sequence,
      narrative: row.narrative,
      documentKind: row.document_kind,
      sellerGstin: row.seller_gstin,
      buyerGstin: row.buyer_gstin,
      amount: debit?.amount ?? 0,
      taxTotal: tax?.total ?? 0,
      eventHash: row.event_hash,
      prevHash: row.prev_hash,
      chainHash: row.chain_hash,
      signers,
      status: deriveStatus(signers, disputed.has(row.id)),
      createdAt: row.created_at,
    };
  });

  // Chain integrity is verified over the whole node chain, in sequence order.
  const { data: all } = await supabaseAdmin
    .from("ledger_elements")
    .select("event_hash, prev_hash, chain_hash")
    .order("sequence", { ascending: true });

  const verified = await verifyChain(
    (all ?? []).map((e) => ({
      eventHash: e.event_hash,
      prevHash: e.prev_hash,
      chainHash: e.chain_hash,
    })),
  );

  return { entries, chainOk: verified.ok, ...(verified.brokenAt !== undefined ? { brokenAt: verified.brokenAt } : {}) };
}

export async function raiseDispute(userId: string, elementId: string, reason: string) {
  const gstins = await myGstins(userId);
  const { data: element, error } = await supabaseAdmin
    .from("ledger_elements")
    .select("id, seller_gstin, buyer_gstin")
    .eq("id", elementId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!element) throw new Error("Ledger element not found");

  const gstin = gstins.find((g) => g === element.seller_gstin || g === element.buyer_gstin);
  if (!gstin) throw new Error("You are not a party to that ledger entry");

  const { error: insertError } = await supabaseAdmin
    .from("ledger_disputes")
    .insert({ element_id: elementId, raised_by: gstin, reason });

  if (insertError) throw new Error(insertError.message);

  return { ok: true };
}

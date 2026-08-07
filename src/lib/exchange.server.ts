import type { Json } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { canonicalDocumentSchema } from "@/lib/canonical/schema";
import { canonicalToRow, rowToCanonical } from "@/lib/canonical/mapper";
import { computeContentHash } from "@/lib/canonical/revision";
import { computeTotals } from "@/lib/canonical/totals";
import type { CanonicalDocument, DocKind } from "@/lib/canonical/types";
import { buildLedgerDraft } from "@/lib/ledger/element";
import { assertOwnsGstin, signAsParticipant, verifyAsParticipant } from "@/lib/registry.server";

/**
 * Exchange layer. A document is delivered as a signed envelope; the signature
 * is detached and computed over the canonical body hash, so the receiver can
 * re-derive the hash from the body it stored and check it independently.
 *
 * Transport is pluggable. `loopback` delivers in-process to another participant
 * registered on this node, which is what makes a two-party flow testable in a
 * single deployment; a real peer would receive the same envelope over HTTP.
 */

/** Who is entitled to issue each document kind. */
export function issuerRole(kind: DocKind): "seller" | "buyer" {
  return kind === "ORDER" || kind === "PAYMENT_ADVICE" || kind === "GRN" ? "buyer" : "seller";
}

export function issuerGstin(doc: CanonicalDocument): string {
  return issuerRole(doc.kind) === "seller" ? doc.seller.gstin : doc.buyer.gstin;
}

export function counterpartyGstin(doc: CanonicalDocument): string {
  return issuerRole(doc.kind) === "seller" ? doc.buyer.gstin : doc.seller.gstin;
}

async function loadDocument(documentId: string) {
  const { data, error } = await supabaseAdmin
    .from("canonical_documents")
    .select("*")
    .eq("id", documentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Document not found");
  return data;
}

export async function persistDraft(
  userId: string,
  input: Omit<CanonicalDocument, "contentHash" | "revision" | "createdAt"> & {
    revision?: number;
    createdAt?: string;
  },
) {
  const draft: CanonicalDocument = {
    ...input,
    revision: input.revision ?? 0,
    contentHash: "",
    createdAt: input.createdAt ?? new Date().toISOString(),
  };

  const parsed = canonicalDocumentSchema.safeParse(draft);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }

  await assertOwnsGstin(userId, issuerGstin(draft));

  const doc: CanonicalDocument = { ...draft, contentHash: await computeContentHash(draft) };
  const totals = computeTotals(doc);

  const { data, error } = await supabaseAdmin
    .from("canonical_documents")
    .insert({
      ...canonicalToRow(doc),
      created_by: userId,
      direction: "OUTBOUND",
      status: "DRAFT",
      source: "UI",
      totals: totals as unknown as Json,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  await supabaseAdmin.from("document_revisions").insert({
    document_id: doc.id,
    revision: 0,
    author_gstin: issuerGstin(doc),
    body: doc as unknown as Json,
    content_hash: doc.contentHash,
    prev_hash: null,
    origin: "UI",
    accepted: true,
  });

  return data;
}

async function nextLedgerSequence() {
  const { data } = await supabaseAdmin
    .from("ledger_elements")
    .select("sequence, chain_hash")
    .order("sequence", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { sequence: (data?.sequence ?? 0) + 1, head: data?.chain_hash ?? "" };
}

/** Open the shared journal element for a trade and sign the issuer's side. */
async function openLedgerElement(doc: CanonicalDocument) {
  const existing = await supabaseAdmin
    .from("ledger_elements")
    .select("id")
    .eq("document_id", doc.id)
    .maybeSingle();
  if (existing.data) return existing.data.id;

  const { sequence, head } = await nextLedgerSequence();
  const draft = await buildLedgerDraft(doc, head);

  const { data, error } = await supabaseAdmin
    .from("ledger_elements")
    .insert({
      sequence,
      document_id: doc.id,
      document_kind: doc.kind,
      event_hash: draft.eventHash,
      prev_hash: draft.prevHash,
      chain_hash: draft.chainHash,
      narrative: draft.narrative,
      debit: draft.debit as unknown as Json,
      credit: draft.credit as unknown as Json,
      tax: draft.tax as unknown as Json,
      seller_gstin: doc.seller.gstin,
      buyer_gstin: doc.buyer.gstin,
      signatures: [] as unknown as Json,
      status: "PENDING_COUNTERSIGN",
    })
    .select("id, chain_hash")
    .single();
  if (error) throw new Error(error.message);

  const issuer = issuerGstin(doc);
  const signed = await signAsParticipant(issuer, data.chain_hash);
  await supabaseAdmin.from("ledger_signatures").insert({
    element_id: data.id,
    gstin: issuer,
    signature: signed.signature,
    key_id: signed.keyId,
  });

  return data.id;
}

async function transition(
  envelopeId: string,
  status: string,
  transitions: unknown,
  detail?: string,
) {
  const history = Array.isArray(transitions) ? transitions : [];
  await supabaseAdmin
    .from("envelopes")
    .update({
      status,
      transitions: [
        ...history,
        { status, at: new Date().toISOString(), ...(detail ? { detail } : {}) },
      ] as unknown as Json,
    })
    .eq("id", envelopeId);
}

/**
 * Sign and deliver. Delivery is idempotent on (document, revision, action):
 * re-sending returns the existing envelope instead of duplicating the message.
 */
export async function sendDocument(userId: string, documentId: string) {
  const row = await loadDocument(documentId);
  const doc = rowToCanonical(row);
  const from = issuerGstin(doc);
  const to = counterpartyGstin(doc);

  await assertOwnsGstin(userId, from);

  const idempotencyKey = `${doc.id}:${doc.revision}:issue`;
  const existing = await supabaseAdmin
    .from("envelopes")
    .select("*")
    .eq("idempotency_key", idempotencyKey)
    .eq("direction", "OUTBOUND")
    .maybeSingle();
  if (existing.data) return existing.data;

  const signed = await signAsParticipant(from, doc.contentHash);

  const { data: envelope, error } = await supabaseAdmin
    .from("envelopes")
    .insert({
      direction: "OUTBOUND",
      document_id: doc.id,
      from_gstin: from,
      to_gstin: to,
      action: `issue_${doc.kind.toLowerCase()}`,
      body_hash: doc.contentHash,
      signature: signed.signature,
      signer_key_id: signed.keyId,
      idempotency_key: idempotencyKey,
      status: "SENT",
      attempts: 1,
      transitions: [{ status: "SENT", at: new Date().toISOString() }] as unknown as Json,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  await supabaseAdmin
    .from("canonical_documents")
    .update({ status: "SENT" })
    .eq("id", doc.id);

  try {
    await deliver(doc, envelope.id, signed.signature, signed.keyId, envelope.transitions);
    await openLedgerElement(doc);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : "Delivery failed";
    await supabaseAdmin.from("envelopes").update({ last_error: detail }).eq("id", envelope.id);
    await transition(envelope.id, "FAILED", envelope.transitions, detail);
    throw new Error(detail);
  }

  return envelope;
}

/**
 * Loopback transport: the receiving participant is registered on this node, so
 * the envelope is verified and mirrored into their inbox in-process.
 */
async function deliver(
  doc: CanonicalDocument,
  envelopeId: string,
  signature: string,
  keyId: string,
  transitions: unknown,
) {
  const to = counterpartyGstin(doc);
  const from = issuerGstin(doc);

  const { data: receiver } = await supabaseAdmin
    .from("participants")
    .select("gstin, user_id, endpoint")
    .eq("gstin", to)
    .maybeSingle();

  if (!receiver) {
    throw new Error(`Counterparty ${to} is not registered on this node`);
  }

  // The receiver checks the sender's signature against the registry, not against
  // anything the sender supplied alongside it.
  const ok = await verifyAsParticipant(from, doc.contentHash, signature);
  if (!ok) throw new Error("Signature failed verification at the receiver");

  const totals = computeTotals(doc);
  const inboundId = crypto.randomUUID();

  const mirror = await supabaseAdmin
    .from("canonical_documents")
    .select("id")
    .eq("document_number", doc.documentNumber)
    .eq("seller_gstin", doc.seller.gstin)
    .eq("direction", "INBOUND")
    .maybeSingle();

  if (!mirror.data) {
    const { error } = await supabaseAdmin.from("canonical_documents").insert({
      ...canonicalToRow({ ...doc, id: inboundId }),
      created_by: receiver.user_id,
      direction: "INBOUND",
      status: "RECEIVED",
      source: "EXCHANGE",
      totals: totals as unknown as Json,
    });
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("envelopes").insert({
      direction: "INBOUND",
      document_id: inboundId,
      from_gstin: from,
      to_gstin: to,
      action: `issue_${doc.kind.toLowerCase()}`,
      body_hash: doc.contentHash,
      signature,
      signer_key_id: keyId,
      idempotency_key: `${doc.id}:${doc.revision}:receive`,
      status: "ACKNOWLEDGED",
      attempts: 1,
      transitions: [
        { status: "SENT", at: new Date().toISOString() },
        { status: "ACKNOWLEDGED", at: new Date().toISOString(), detail: "loopback" },
      ] as unknown as Json,
    });
  }

  await transition(envelopeId, "ACKNOWLEDGED", transitions, "loopback");
}

/** Accept or reject a received document, and countersign the shared journal entry. */
export async function respondToDocument(
  userId: string,
  documentId: string,
  decision: "ACCEPTED" | "REJECTED",
  reason?: string,
) {
  const row = await loadDocument(documentId);
  const doc = rowToCanonical(row);
  const responder = counterpartyGstin(doc);

  await assertOwnsGstin(userId, responder);
  if (row.direction !== "INBOUND") throw new Error("Only received documents can be responded to");

  const signed = await signAsParticipant(responder, doc.contentHash);

  await supabaseAdmin.from("envelopes").insert({
    direction: "OUTBOUND",
    document_id: doc.id,
    from_gstin: responder,
    to_gstin: issuerGstin(doc),
    action: decision === "ACCEPTED" ? "accept" : "reject",
    body_hash: doc.contentHash,
    signature: signed.signature,
    signer_key_id: signed.keyId,
    idempotency_key: `${doc.id}:${doc.revision}:${decision.toLowerCase()}`,
    status: "ACKNOWLEDGED",
    attempts: 1,
    transitions: [
      { status: "SENT", at: new Date().toISOString() },
      {
        status: "ACKNOWLEDGED",
        at: new Date().toISOString(),
        ...(reason ? { detail: reason } : {}),
      },
    ] as unknown as Json,
  });

  await supabaseAdmin
    .from("canonical_documents")
    .update({ status: decision, notes: reason ?? row.notes })
    .eq("id", doc.id);

  // Mirror the outcome on the issuer's copy of the same trade.
  await supabaseAdmin
    .from("canonical_documents")
    .update({ status: decision })
    .eq("document_number", doc.documentNumber)
    .eq("seller_gstin", doc.seller.gstin)
    .eq("direction", "OUTBOUND");

  if (decision === "ACCEPTED") {
    const { data: element } = await supabaseAdmin
      .from("ledger_elements")
      .select("id, chain_hash")
      .eq("document_number", doc.documentNumber)
      .maybeSingle()
      .then(async (result) =>
        result.data
          ? result
          : await supabaseAdmin
              .from("ledger_elements")
              .select("id, chain_hash")
              .eq("seller_gstin", doc.seller.gstin)
              .eq("buyer_gstin", doc.buyer.gstin)
              .order("sequence", { ascending: false })
              .limit(1)
              .maybeSingle(),
      );

    if (element) {
      const counter = await signAsParticipant(responder, element.chain_hash);
      await supabaseAdmin.from("ledger_signatures").insert({
        element_id: element.id,
        gstin: responder,
        signature: counter.signature,
        key_id: counter.keyId,
      });
    }
  }

  return { status: decision };
}

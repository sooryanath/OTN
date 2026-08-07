import type { CanonicalDocument, DocKind, LineItem, Party, Transport } from "./types";

/**
 * Translation between the canonical in-memory document and its database row.
 * Kept in one place so no route or server function hand-rolls column names.
 */

export type DocumentRow = {
  id: string;
  kind: string;
  document_number: string;
  issue_date: string;
  currency: string;
  seller_gstin: string;
  buyer_gstin: string;
  seller: unknown;
  buyer: unknown;
  lines: unknown;
  transport: unknown;
  doc_references: unknown;
  payment_terms_days: number;
  notes: string | null;
  revision: number;
  content_hash: string;
  status: string;
  direction: string;
  source: string;
  totals: unknown;
  created_at: string;
};

export function rowToCanonical(row: DocumentRow): CanonicalDocument {
  return {
    id: row.id,
    kind: row.kind as DocKind,
    documentNumber: row.document_number,
    issueDate: row.issue_date,
    currency: row.currency,
    seller: row.seller as Party,
    buyer: row.buyer as Party,
    lines: (row.lines ?? []) as LineItem[],
    ...(row.transport ? { transport: row.transport as Transport } : {}),
    ...(row.doc_references
      ? { references: row.doc_references as NonNullable<CanonicalDocument["references"]> }
      : {}),
    paymentTermsDays: row.payment_terms_days,
    ...(row.notes ? { notes: row.notes } : {}),
    revision: row.revision,
    contentHash: row.content_hash,
    createdAt: row.created_at,
  };
}

export function canonicalToRow(doc: CanonicalDocument) {
  return {
    kind: doc.kind,
    document_number: doc.documentNumber,
    issue_date: doc.issueDate,
    currency: doc.currency,
    seller_gstin: doc.seller.gstin,
    buyer_gstin: doc.buyer.gstin,
    seller: doc.seller,
    buyer: doc.buyer,
    lines: doc.lines,
    transport: doc.transport ?? null,
    doc_references: doc.references ?? null,
    payment_terms_days: doc.paymentTermsDays,
    notes: doc.notes ?? null,
    revision: doc.revision,
    content_hash: doc.contentHash,
  };
}

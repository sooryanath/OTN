import { hashObject, sha256Hex } from "@/lib/crypto";
import { computeTotals } from "@/lib/canonical/totals";
import type { CanonicalDocument, DocKind } from "@/lib/canonical/types";

/**
 * Triple-entry ledger element (Pacio-style shared journal).
 *
 * Both counterparties book against ONE entry instead of keeping two private
 * entries that later have to be matched. The entry is content-addressed and
 * chained to the previous entry, and each party attaches its own signature.
 * Reconciliation becomes signature verification, not fuzzy matching.
 */

export type LedgerLeg = { gstin: string; account: string; amount: number };

export type LedgerDraft = {
  documentId: string;
  documentKind: DocKind;
  sellerGstin: string;
  buyerGstin: string;
  narrative: string;
  debit: LedgerLeg;
  credit: LedgerLeg;
  tax: { cgst: number; sgst: number; igst: number; cess: number; total: number };
  eventHash: string;
  prevHash: string;
  chainHash: string;
};

/** Which accounts each side moves, per document kind. */
function legsFor(doc: CanonicalDocument, amount: number): { debit: LedgerLeg; credit: LedgerLeg } {
  const seller = doc.seller.gstin;
  const buyer = doc.buyer.gstin;

  switch (doc.kind) {
    case "INVOICE":
      return {
        debit: { gstin: buyer, account: "Purchases", amount },
        credit: { gstin: seller, account: "Sales Revenue", amount },
      };
    case "CREDIT_NOTE":
      return {
        debit: { gstin: seller, account: "Sales Returns", amount },
        credit: { gstin: buyer, account: "Purchase Returns", amount },
      };
    case "PAYMENT_ADVICE":
      return {
        debit: { gstin: seller, account: "Bank", amount },
        credit: { gstin: buyer, account: "Bank", amount },
      };
    default:
      return {
        debit: { gstin: buyer, account: "Commitments", amount },
        credit: { gstin: seller, account: "Commitments", amount },
      };
  }
}

export async function buildLedgerDraft(
  doc: CanonicalDocument,
  prevHash: string,
): Promise<LedgerDraft> {
  const totals = computeTotals(doc);
  const { debit, credit } = legsFor(doc, totals.grandTotal);

  const event = {
    documentId: doc.id,
    documentKind: doc.kind,
    documentHash: doc.contentHash,
    sellerGstin: doc.seller.gstin,
    buyerGstin: doc.buyer.gstin,
    debit,
    credit,
    tax: {
      cgst: totals.cgst,
      sgst: totals.sgst,
      igst: totals.igst,
      cess: totals.cess,
      total: totals.totalTax,
    },
  };

  const eventHash = await hashObject(event);
  const chainHash = await sha256Hex(`${prevHash}:${eventHash}`);

  return {
    documentId: doc.id,
    documentKind: doc.kind,
    sellerGstin: doc.seller.gstin,
    buyerGstin: doc.buyer.gstin,
    narrative: `${doc.kind} ${doc.documentNumber} — ${doc.seller.legalName} → ${doc.buyer.legalName}`,
    debit,
    credit,
    tax: event.tax,
    eventHash,
    prevHash,
    chainHash,
  };
}

export type ElementStatus = "PENDING_COUNTERSIGN" | "MATCHED" | "DISPUTED";

/**
 * Status is derived, never stored-and-edited: the ledger tables are
 * append-only, so state comes from the signatures and disputes on record.
 */
export function deriveStatus(signerGstins: string[], hasDispute: boolean): ElementStatus {
  if (hasDispute) return "DISPUTED";
  return new Set(signerGstins).size >= 2 ? "MATCHED" : "PENDING_COUNTERSIGN";
}

/** Replay a chain and report the first entry whose link does not hold. */
export async function verifyChain(
  elements: { eventHash: string; prevHash: string; chainHash: string }[],
): Promise<{ ok: boolean; brokenAt?: number }> {
  let expectedPrev = "";
  for (let i = 0; i < elements.length; i += 1) {
    const el = elements[i]!;
    const chainHash = await sha256Hex(`${el.prevHash}:${el.eventHash}`);
    if (el.prevHash !== expectedPrev || chainHash !== el.chainHash) {
      return { ok: false, brokenAt: i };
    }
    expectedPrev = el.chainHash;
  }
  return { ok: true };
}

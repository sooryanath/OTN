import { describe, expect, it } from "vitest";

import { buildLedgerDraft, deriveStatus, verifyChain } from "@/lib/ledger/element";
import { computeContentHash } from "@/lib/canonical/revision";
import { computeTotals } from "@/lib/canonical/totals";

import { multiLineInvoice, simpleInvoice } from "../__fixtures__/documents";

async function hashed(doc = simpleInvoice()) {
  return { ...doc, contentHash: await computeContentHash(doc) };
}

describe("ledger element", () => {
  it("books the grand total on both legs of one shared entry", async () => {
    const doc = await hashed();
    const totals = computeTotals(doc);
    const draft = await buildLedgerDraft(doc, "");

    expect(draft.debit.amount).toBe(totals.grandTotal);
    expect(draft.credit.amount).toBe(totals.grandTotal);
    expect(draft.debit.gstin).toBe(doc.buyer.gstin);
    expect(draft.credit.gstin).toBe(doc.seller.gstin);
    expect(draft.tax.total).toBe(totals.totalTax);
  });

  it("is content-addressed: same trade, same event hash", async () => {
    const doc = await hashed();
    const a = await buildLedgerDraft(doc, "");
    const b = await buildLedgerDraft(doc, "");
    expect(a.eventHash).toBe(b.eventHash);
  });

  it("gives different trades different event hashes", async () => {
    const a = await buildLedgerDraft(await hashed(), "");
    const b = await buildLedgerDraft(await hashed(multiLineInvoice()), "");
    expect(a.eventHash).not.toBe(b.eventHash);
  });

  it("chains to the previous entry", async () => {
    const first = await buildLedgerDraft(await hashed(), "");
    const second = await buildLedgerDraft(await hashed(multiLineInvoice()), first.chainHash);
    expect(second.prevHash).toBe(first.chainHash);

    const verified = await verifyChain([first, second]);
    expect(verified.ok).toBe(true);
  });

  it("detects a tampered chain", async () => {
    const first = await buildLedgerDraft(await hashed(), "");
    const second = await buildLedgerDraft(await hashed(multiLineInvoice()), first.chainHash);
    const broken = { ...second, prevHash: "" };
    const verified = await verifyChain([first, broken]);
    expect(verified.ok).toBe(false);
    expect(verified.brokenAt).toBe(1);
  });
});

describe("derived element status", () => {
  it("waits for the counterparty signature", () => {
    expect(deriveStatus(["27AAPFU0939F1ZV"], false)).toBe("PENDING_COUNTERSIGN");
  });

  it("matches once both parties have signed", () => {
    expect(deriveStatus(["27AAPFU0939F1ZV", "27AACCM9910C1ZN"], false)).toBe("MATCHED");
  });

  it("does not match on two signatures from the same party", () => {
    expect(deriveStatus(["27AAPFU0939F1ZV", "27AAPFU0939F1ZV"], false)).toBe(
      "PENDING_COUNTERSIGN",
    );
  });

  it("a dispute outranks signatures", () => {
    expect(deriveStatus(["27AAPFU0939F1ZV", "27AACCM9910C1ZN"], true)).toBe("DISPUTED");
  });
});

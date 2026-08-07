import { describe, expect, it } from "vitest";

import {
  droppedOnExport,
  fromGstEInvoice,
  toGstEInvoice,
  validateForIrp,
} from "@/lib/profiles/gst-einvoice";
import { computeTotals } from "@/lib/canonical/totals";
import type { CanonicalDocument } from "@/lib/canonical/types";

import { discountedInvoice, multiLineInvoice, simpleInvoice } from "../__fixtures__/documents";

/** Compare only the fields the IRP schema is able to carry. */
function comparable(doc: CanonicalDocument) {
  return {
    kind: doc.kind,
    documentNumber: doc.documentNumber,
    issueDate: doc.issueDate,
    currency: doc.currency,
    seller: doc.seller,
    buyer: { ...doc.buyer },
    lines: doc.lines,
    paymentTermsDays: doc.paymentTermsDays,
    references: doc.references,
  };
}

const fixtures: [string, CanonicalDocument][] = [
  ["simple single-line intra-state", simpleInvoice()],
  ["multi-line inter-state", multiLineInvoice()],
  ["with discount and cess", discountedInvoice()],
];

describe("gst-einvoice profile", () => {
  for (const [name, doc] of fixtures) {
    it(`round-trips ${name}`, () => {
      const payload = toGstEInvoice(doc);
      const back = fromGstEInvoice(payload, { id: doc.id, createdAt: doc.createdAt });
      expect(comparable(back)).toEqual(comparable(doc));
    });
  }

  it("carries the same tax split as the canonical totals", () => {
    const doc = multiLineInvoice();
    const totals = computeTotals(doc);
    const payload = toGstEInvoice(doc);

    expect(payload.ValDtls.AssVal).toBe(totals.taxableValue);
    expect(payload.ValDtls.IgstVal).toBe(totals.igst);
    expect(payload.ValDtls.CgstVal).toBe(totals.cgst);
    expect(payload.ValDtls.TotInvVal).toBe(totals.grandTotal);
  });

  it("uses intra-state CGST/SGST when both parties share a state", () => {
    const payload = toGstEInvoice(simpleInvoice());
    expect(payload.ValDtls.IgstVal).toBe(0);
    expect(payload.ValDtls.CgstVal).toBeGreaterThan(0);
    expect(payload.ValDtls.SgstVal).toBeGreaterThan(0);
  });

  it("maps a credit note to the CRN document type", () => {
    const payload = toGstEInvoice(simpleInvoice({ kind: "CREDIT_NOTE" }));
    expect(payload.DocDtls.Typ).toBe("CRN");
  });

  it("documents what the export cannot carry", () => {
    expect(droppedOnExport).toContain("notes");
  });

  it("flags documents the IRP would reject", () => {
    expect(validateForIrp(simpleInvoice())).toHaveLength(0);
    expect(validateForIrp(simpleInvoice({ kind: "ORDER" }))).not.toHaveLength(0);

    const oddRate = simpleInvoice();
    oddRate.lines[0]!.taxRate = 17;
    expect(validateForIrp(oddRate).join(" ")).toContain("not a notified GST rate");
  });
});

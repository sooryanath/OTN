import { computeTotals, lineTaxable, round2 } from "@/lib/canonical/totals";
import type { CanonicalDocument } from "@/lib/canonical/types";

/**
 * GST e-Invoice profile (NIC schema 1.1, INV/CRN document types).
 * Projection only — the canonical document remains the source of truth.
 */
export function toGstEInvoice(doc: CanonicalDocument) {
  const totals = computeTotals(doc);
  const typeCode = doc.kind === "CREDIT_NOTE" ? "CRN" : "INV";

  return {
    Version: "1.1",
    TranDtls: {
      TaxSch: "GST",
      SupTyp: "B2B",
      RegRev: "N",
      IgstOnIntra: "N",
    },
    DocDtls: {
      Typ: typeCode,
      No: doc.documentNumber,
      Dt: toGstDate(doc.issueDate),
    },
    SellerDtls: {
      Gstin: doc.seller.gstin,
      LglNm: doc.seller.legalName,
      TrdNm: doc.seller.tradeName ?? doc.seller.legalName,
      Addr1: doc.seller.address,
      Loc: doc.seller.city,
      Pin: Number(doc.seller.pincode),
      Stcd: doc.seller.stateCode,
      Em: doc.seller.email || undefined,
      Ph: doc.seller.phone || undefined,
    },
    BuyerDtls: {
      Gstin: doc.buyer.gstin,
      LglNm: doc.buyer.legalName,
      TrdNm: doc.buyer.tradeName ?? doc.buyer.legalName,
      Pos: doc.buyer.stateCode,
      Addr1: doc.buyer.address,
      Loc: doc.buyer.city,
      Pin: Number(doc.buyer.pincode),
      Stcd: doc.buyer.stateCode,
    },
    ItemList: doc.lines.map((line, index) => {
      const taxable = lineTaxable(line);
      const tax = round2((taxable * line.taxRate) / 100);
      const cess = round2((taxable * (line.cessRate ?? 0)) / 100);
      return {
        SlNo: String(index + 1),
        PrdDesc: line.description,
        IsServc: "N",
        HsnCd: line.hsn,
        Qty: line.quantity,
        Unit: line.uom,
        UnitPrice: line.unitPrice,
        TotAmt: round2(line.quantity * line.unitPrice),
        Discount: line.discount,
        AssAmt: taxable,
        GstRt: line.taxRate,
        IgstAmt: totals.intraState ? 0 : tax,
        CgstAmt: totals.intraState ? round2(tax / 2) : 0,
        SgstAmt: totals.intraState ? round2(tax - round2(tax / 2)) : 0,
        CesRt: line.cessRate ?? 0,
        CesAmt: cess,
        TotItemVal: round2(taxable + tax + cess),
      };
    }),
    ValDtls: {
      AssVal: totals.taxableValue,
      CgstVal: totals.cgst,
      SgstVal: totals.sgst,
      IgstVal: totals.igst,
      CesVal: totals.cess,
      TotInvVal: totals.grandTotal,
    },
    PayDtls: {
      PaymtDue: doc.paymentTermsDays,
    },
    RefDtls: doc.references?.orderRef
      ? { DocPerdDtls: null, PrecDocDtls: [{ InvNo: doc.references.orderRef }] }
      : undefined,
  };
}

function toGstDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** Fields the IRP would reject — surfaced in the UI before submission. */
export function validateForIrp(doc: CanonicalDocument): string[] {
  const problems: string[] = [];
  if (doc.kind !== "INVOICE" && doc.kind !== "CREDIT_NOTE") {
    problems.push("Only INVOICE and CREDIT_NOTE map to the e-invoice schema.");
  }
  if (doc.documentNumber.length > 16) problems.push("Document number exceeds 16 characters.");
  if (!doc.buyer.gstin) problems.push("Buyer GSTIN is required for a B2B e-invoice.");
  for (const line of doc.lines) {
    if (![0, 0.1, 0.25, 1, 1.5, 3, 5, 7.5, 12, 18, 28].includes(line.taxRate)) {
      problems.push(`Tax rate ${line.taxRate}% on "${line.description}" is not a notified GST rate.`);
    }
  }
  return problems;
}

/** Canonical fields the IRP schema has no home for. */
export const droppedOnExport = [
  "notes",
  "transport.transporterGstin",
  "transport.distanceKm",
  "references.reasonCode",
  "lines[].id",
] as const;

type IrpPayload = ReturnType<typeof toGstEInvoice>;

function fromGstDate(value: string): string {
  const [d, m, y] = value.split("/");
  return `${y}-${m}-${d}`;
}

/**
 * Inverse projection: IRP payload back to canonical. Only the fields the IRP
 * schema carries can be restored — see `droppedOnExport` for the rest, which is
 * why the canonical document, not the profile payload, is the source of truth.
 */
export function fromGstEInvoice(
  payload: IrpPayload,
  meta: { id: string; createdAt: string; revision?: number },
): CanonicalDocument {
  const seller = payload.SellerDtls;
  const buyer = payload.BuyerDtls;

  return {
    id: meta.id,
    kind: payload.DocDtls.Typ === "CRN" ? "CREDIT_NOTE" : "INVOICE",
    documentNumber: payload.DocDtls.No,
    issueDate: fromGstDate(payload.DocDtls.Dt),
    currency: "INR",
    seller: {
      gstin: seller.Gstin,
      legalName: seller.LglNm,
      ...(seller.TrdNm && seller.TrdNm !== seller.LglNm ? { tradeName: seller.TrdNm } : {}),
      stateCode: seller.Stcd,
      address: seller.Addr1,
      city: seller.Loc,
      pincode: String(seller.Pin),
      ...(seller.Em ? { email: seller.Em } : {}),
      ...(seller.Ph ? { phone: seller.Ph } : {}),
    },
    buyer: {
      gstin: buyer.Gstin,
      legalName: buyer.LglNm,
      ...(buyer.TrdNm && buyer.TrdNm !== buyer.LglNm ? { tradeName: buyer.TrdNm } : {}),
      stateCode: buyer.Stcd,
      address: buyer.Addr1,
      city: buyer.Loc,
      pincode: String(buyer.Pin),
    },
    lines: payload.ItemList.map((item, index) => ({
      id: `l${index + 1}`,
      description: item.PrdDesc,
      hsn: item.HsnCd,
      quantity: item.Qty,
      uom: item.Unit,
      unitPrice: item.UnitPrice,
      discount: item.Discount,
      taxRate: item.GstRt,
      ...(item.CesRt ? { cessRate: item.CesRt } : {}),
    })),
    ...(payload.RefDtls?.PrecDocDtls?.[0]?.InvNo
      ? { references: { orderRef: payload.RefDtls.PrecDocDtls[0].InvNo } }
      : {}),
    paymentTermsDays: payload.PayDtls.PaymtDue,
    revision: meta.revision ?? 0,
    contentHash: "",
    createdAt: meta.createdAt,
  };
}

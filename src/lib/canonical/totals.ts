import type { CanonicalDocument, DocumentTotals, LineItem } from "./types";

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function lineTaxable(line: LineItem): number {
  return round2(Math.max(line.quantity * line.unitPrice - line.discount, 0));
}

export function computeTotals(doc: CanonicalDocument): DocumentTotals {
  const intraState = doc.seller.stateCode === doc.buyer.stateCode;

  let taxableValue = 0;
  let tax = 0;
  let cess = 0;

  for (const line of doc.lines) {
    const taxable = lineTaxable(line);
    taxableValue += taxable;
    tax += (taxable * line.taxRate) / 100;
    cess += (taxable * (line.cessRate ?? 0)) / 100;
  }

  taxableValue = round2(taxableValue);
  tax = round2(tax);
  cess = round2(cess);

  const cgst = intraState ? round2(tax / 2) : 0;
  const sgst = intraState ? round2(tax - cgst) : 0;
  const igst = intraState ? 0 : tax;

  return {
    taxableValue,
    cgst,
    sgst,
    igst,
    cess,
    totalTax: round2(tax + cess),
    grandTotal: round2(taxableValue + tax + cess),
    intraState,
  };
}

export function formatINR(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

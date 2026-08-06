/**
 * Canonical trade document model.
 *
 * This is the single source of truth. Every external standard (GST e-invoice,
 * e-way bill, ONDC/Beckn, OCEN, UN/EDIFACT) is a *projection* of this model,
 * produced by a profile codec in src/lib/profiles.
 *
 * Never store a profile payload as the source of truth — store canonical,
 * project on demand.
 */

export const DOC_KINDS = [
  "ORDER",
  "INVOICE",
  "DISPATCH",
  "GRN",
  "PAYMENT_ADVICE",
  "CREDIT_NOTE",
] as const;

export type DocKind = (typeof DOC_KINDS)[number];

export const DOC_KIND_LABEL: Record<DocKind, string> = {
  ORDER: "Purchase Order",
  INVOICE: "Tax Invoice",
  DISPATCH: "Dispatch Advice",
  GRN: "Goods Receipt Note",
  PAYMENT_ADVICE: "Payment Advice",
  CREDIT_NOTE: "Credit Note",
};

export type Party = {
  gstin: string;
  legalName: string;
  tradeName?: string;
  stateCode: string;
  address: string;
  city: string;
  pincode: string;
  email?: string;
  phone?: string;
};

export type LineItem = {
  id: string;
  description: string;
  hsn: string;
  quantity: number;
  uom: string;
  unitPrice: number;
  discount: number;
  taxRate: number;
  cessRate?: number;
};

export type Transport = {
  mode: "ROAD" | "RAIL" | "AIR" | "SHIP";
  vehicleNumber?: string;
  transporterGstin?: string;
  distanceKm?: number;
  dispatchFrom?: string;
  shipTo?: string;
};

export type CanonicalDocument = {
  /** Stable internal IRI-suffix identifier. */
  id: string;
  kind: DocKind;
  documentNumber: string;
  issueDate: string;
  currency: string;
  seller: Party;
  buyer: Party;
  lines: LineItem[];
  transport?: Transport;
  references?: {
    orderRef?: string;
    invoiceRef?: string;
    reasonCode?: string;
  };
  paymentTermsDays: number;
  notes?: string;
  revision: number;
  /** sha256 over the canonicalised JSON body, set on persist. */
  contentHash: string;
  createdAt: string;
};

export type DocumentTotals = {
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  totalTax: number;
  grandTotal: number;
  intraState: boolean;
};

export type ExchangeStatus =
  | "DRAFT"
  | "SENT"
  | "ACKNOWLEDGED"
  | "ACCEPTED"
  | "REJECTED"
  | "FAILED";

export type Direction = "OUTBOUND" | "INBOUND";

/** Signed message envelope — ONDC/Beckn style detached signature over the body hash. */
export type Envelope = {
  id: string;
  direction: Direction;
  documentId: string;
  fromGstin: string;
  toGstin: string;
  action: string;
  bodyHash: string;
  signature: string;
  signerKeyId: string;
  idempotencyKey: string;
  status: ExchangeStatus;
  attempts: number;
  transitions: { status: ExchangeStatus; at: string; detail?: string }[];
  createdAt: string;
};

export type LedgerLeg = {
  gstin: string;
  account: string;
  amount: number;
};

/**
 * Pacio-style shared journal element: ONE entry both counterparties book
 * against, hash-chained and counter-signed. Reconciliation becomes
 * verification instead of matching.
 */
export type LedgerElement = {
  id: string;
  sequence: number;
  documentId: string;
  documentKind: DocKind;
  eventHash: string;
  prevHash: string;
  chainHash: string;
  narrative: string;
  debit: LedgerLeg;
  credit: LedgerLeg;
  signatures: { gstin: string; signature: string; keyId: string; at: string }[];
  status: "PENDING_COUNTERSIGN" | "MATCHED" | "DISPUTED" | "REVERSED";
  dispute?: { raisedBy: string; reason: string; at: string };
  createdAt: string;
};

export type Participant = {
  gstin: string;
  legalName: string;
  stateCode: string;
  publicKeyJwk: JsonWebKey | null;
  keyId: string;
  endpoint: string;
  profiles: string[];
  registeredAt: string;
};

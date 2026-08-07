import type { CanonicalDocument } from "@/lib/canonical/types";

/**
 * Test fixtures. GSTINs here carry valid mod-36 check characters so the
 * registry's checksum validation accepts them.
 */

export const SELLER = {
  gstin: "27AAPFU0939F1ZV",
  legalName: "Nashik Precision Components LLP",
  tradeName: "Nashik Precision",
  stateCode: "27",
  address: "Plot 14, MIDC Satpur",
  city: "Nashik",
  pincode: "422007",
  email: "accounts@nashikprecision.in",
  phone: "9820011223",
};

export const BUYER_SAME_STATE = {
  gstin: "27AACCM9910C1ZM",
  legalName: "Mahalaxmi Auto Assemblies Pvt Ltd",
  stateCode: "27",
  address: "Gat 210, Chakan Industrial Area",
  city: "Pune",
  pincode: "410501",
};

export const BUYER_OTHER_STATE = {
  gstin: "29AACCM9910C1ZH",
  legalName: "Peenya Drivetrain Systems Pvt Ltd",
  stateCode: "29",
  address: "Unit 7, Peenya Industrial Area",
  city: "Bengaluru",
  pincode: "560058",
};

export function simpleInvoice(overrides: Partial<CanonicalDocument> = {}): CanonicalDocument {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    kind: "INVOICE",
    documentNumber: "INV-2026-0001",
    issueDate: "2026-08-01",
    currency: "INR",
    seller: SELLER,
    buyer: BUYER_SAME_STATE,
    lines: [
      {
        id: "l1",
        description: "Machined flange 80mm",
        hsn: "84829900",
        quantity: 100,
        uom: "NOS",
        unitPrice: 250,
        discount: 0,
        taxRate: 18,
      },
    ],
    paymentTermsDays: 45,
    revision: 0,
    contentHash: "",
    createdAt: "2026-08-01T05:00:00.000Z",
    ...overrides,
  };
}

export function multiLineInvoice(): CanonicalDocument {
  return simpleInvoice({
    documentNumber: "INV-2026-0002",
    buyer: BUYER_OTHER_STATE,
    lines: [
      {
        id: "l1",
        description: "Machined flange 80mm",
        hsn: "84829900",
        quantity: 100,
        uom: "NOS",
        unitPrice: 250,
        discount: 0,
        taxRate: 18,
      },
      {
        id: "l2",
        description: "Hardened dowel pin",
        hsn: "73181500",
        quantity: 500,
        uom: "NOS",
        unitPrice: 12.5,
        discount: 0,
        taxRate: 18,
      },
      {
        id: "l3",
        description: "Freight and handling",
        hsn: "9965",
        quantity: 1,
        uom: "NOS",
        unitPrice: 1800,
        discount: 0,
        taxRate: 5,
      },
    ],
  });
}

export function discountedInvoice(): CanonicalDocument {
  return simpleInvoice({
    documentNumber: "INV-2026-0003",
    lines: [
      {
        id: "l1",
        description: "Machined flange 80mm",
        hsn: "84829900",
        quantity: 200,
        uom: "NOS",
        unitPrice: 250,
        discount: 5000,
        taxRate: 18,
        cessRate: 1,
      },
    ],
  });
}

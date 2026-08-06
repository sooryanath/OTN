import { z } from "zod";

import { DOC_KINDS } from "./types";

export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export const partySchema = z.object({
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(GSTIN_REGEX, { message: "Must be a valid 15-character GSTIN" }),
  legalName: z.string().trim().min(2, "Legal name is required").max(160),
  tradeName: z.string().trim().max(160).optional(),
  stateCode: z.string().trim().regex(/^[0-9]{2}$/, "Two-digit state code"),
  address: z.string().trim().min(4, "Address is required").max(300),
  city: z.string().trim().min(2).max(80),
  pincode: z.string().trim().regex(/^[1-9][0-9]{5}$/, "Six-digit PIN code"),
  email: z.string().trim().email("Invalid email").max(160).optional().or(z.literal("")),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
});

export const lineItemSchema = z.object({
  id: z.string(),
  description: z.string().trim().min(2, "Description is required").max(300),
  hsn: z.string().trim().regex(/^[0-9]{4,8}$/, "HSN must be 4-8 digits"),
  quantity: z.number().positive("Quantity must be > 0").max(1_000_000),
  uom: z.string().trim().min(1).max(6),
  unitPrice: z.number().nonnegative().max(100_000_000),
  discount: z.number().nonnegative().max(100_000_000),
  taxRate: z.number().min(0).max(28),
  cessRate: z.number().min(0).max(100).optional(),
});

export const transportSchema = z.object({
  mode: z.enum(["ROAD", "RAIL", "AIR", "SHIP"]),
  vehicleNumber: z.string().trim().max(20).optional().or(z.literal("")),
  transporterGstin: z.string().trim().max(15).optional().or(z.literal("")),
  distanceKm: z.number().nonnegative().max(10_000).optional(),
  dispatchFrom: z.string().trim().max(120).optional().or(z.literal("")),
  shipTo: z.string().trim().max(120).optional().or(z.literal("")),
});

export const canonicalDocumentSchema = z.object({
  id: z.string(),
  kind: z.enum(DOC_KINDS),
  documentNumber: z.string().trim().min(1, "Document number is required").max(16),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  currency: z.string().length(3),
  seller: partySchema,
  buyer: partySchema,
  lines: z.array(lineItemSchema).min(1, "At least one line item is required"),
  transport: transportSchema.optional(),
  references: z
    .object({
      orderRef: z.string().trim().max(40).optional().or(z.literal("")),
      invoiceRef: z.string().trim().max(40).optional().or(z.literal("")),
      reasonCode: z.string().trim().max(40).optional().or(z.literal("")),
    })
    .optional(),
  paymentTermsDays: z.number().int().min(0).max(365),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  revision: z.number().int().nonnegative(),
  contentHash: z.string(),
  createdAt: z.string(),
});

export type CanonicalDocumentInput = z.input<typeof canonicalDocumentSchema>;

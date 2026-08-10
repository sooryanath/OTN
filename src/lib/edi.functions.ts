import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DOC_KINDS } from "@/lib/canonical/types";

/**
 * RPC surface. Thin wrappers only: every handler delegates to a server-only
 * module, and nothing else lives at module scope in this file.
 */

const partySchema = z.object({
  gstin: z.string(),
  legalName: z.string(),
  tradeName: z.string().optional(),
  stateCode: z.string(),
  address: z.string(),
  city: z.string(),
  pincode: z.string(),
  email: z.string().optional(),
  phone: z.string().optional(),
});

const lineSchema = z.object({
  id: z.string(),
  description: z.string(),
  hsn: z.string(),
  quantity: z.number(),
  uom: z.string(),
  unitPrice: z.number(),
  discount: z.number(),
  taxRate: z.number(),
  cessRate: z.number().optional(),
});

const draftSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(DOC_KINDS),
  documentNumber: z.string(),
  issueDate: z.string(),
  currency: z.string().default("INR"),
  seller: partySchema,
  buyer: partySchema,
  lines: z.array(lineSchema).min(1),
  paymentTermsDays: z.number(),
  notes: z.string().optional(),
  references: z
    .object({
      orderRef: z.string().optional(),
      invoiceRef: z.string().optional(),
      reasonCode: z.string().optional(),
    })
    .optional(),
});

export const registerParticipant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        gstin: z.string(),
        legalName: z.string().min(2),
        tradeName: z.string().optional(),
        address: z.string().min(3),
        city: z.string().min(2),
        pincode: z.string().min(6),
        email: z.string().email().optional(),
        phone: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { createParticipant } = await import("@/lib/registry.server");
    const row = await createParticipant(context.userId, data as unknown as import("@/lib/registry.server").ParticipantInput);
    return { gstin: row.gstin, keyId: row.key_id };
  });

export const rotateKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ gstin: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    const { rotateParticipantKey } = await import("@/lib/registry.server");
    const row = await rotateParticipantKey(context.userId, data.gstin);
    return { gstin: row.gstin, keyId: row.key_id };
  });

export const myParticipants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listParticipants } = await import("@/lib/queries.server");
    return listParticipants(context.userId);
  });

export const directory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { listDirectory } = await import("@/lib/queries.server");
    return listDirectory();
  });

export const createDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => draftSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { persistDraft } = await import("@/lib/exchange.server");
    const row = await persistDraft(context.userId, data as unknown as Parameters<typeof persistDraft>[1]);
    return { id: row.id, contentHash: row.content_hash };
  });

export const listMyDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listDocuments } = await import("@/lib/queries.server");
    return listDocuments(context.userId);
  });

export const getDocumentDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { getDocument } = await import("@/lib/queries.server");
    return getDocument(context.userId, data.id);
  });

export const sendDocumentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { sendDocument } = await import("@/lib/exchange.server");
    const envelope = await sendDocument(context.userId, data.id);
    return { envelopeId: envelope.id, status: envelope.status };
  });

export const respondFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["ACCEPTED", "REJECTED"]),
        reason: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { respondToDocument } = await import("@/lib/exchange.server");
    return respondToDocument(context.userId, data.id, data.decision, data.reason);
  });

export const ledger = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listLedger } = await import("@/lib/queries.server");
    return listLedger(context.userId);
  });

export const disputeElement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ elementId: z.string().uuid(), reason: z.string().min(3) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { raiseDispute } = await import("@/lib/queries.server");
    return raiseDispute(context.userId, data.elementId, data.reason);
  });

/** GST e-invoice projection of a stored document — the profile view. */
export const gstProjection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { getDocument } = await import("@/lib/queries.server");
    const { toGstEInvoice } = await import("@/lib/profiles/gst-einvoice");
    const { document } = await getDocument(context.userId, data.id);
    return toGstEInvoice(document);
  });

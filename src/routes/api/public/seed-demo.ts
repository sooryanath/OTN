import { createFileRoute } from "@tanstack/react-router";

/**
 * One-shot demo seeder. Creates the demo account and drives real protocol code
 * paths (registry key minting, signed envelopes, countersigned journal) so every
 * hash and signature in the seeded data verifies. Guarded by SEED_TOKEN.
 */

const DEMO_EMAIL = "demo@tradeconnect.in";
const DEMO_PASSWORD = "TradeConnect#2026";

const SELLER = {
  gstin: "27AAPFU0939F1ZV",
  legalName: "Sunrise Textiles Pvt Ltd",
  tradeName: "Sunrise Textiles",
  stateCode: "27",
  address: "Unit 22, Bhiwandi Textile Park",
  city: "Thane",
  pincode: "421302",
  email: "accounts@sunrisetextiles.in",
  phone: "9820044556",
};

const BUYER = {
  gstin: "29AACCM9910C1ZJ",
  legalName: "Deccan Retail LLP",
  tradeName: "Deccan Retail",
  stateCode: "29",
  address: "No. 14, Peenya Industrial Area",
  city: "Bengaluru",
  pincode: "560058",
  email: "payables@deccanretail.in",
  phone: "9845011223",
};

export const Route = createFileRoute("/api/public/seed-demo")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env["SEED_TOKEN"];
        const provided = request.headers.get("x-seed-token");
        if (!token || provided !== token) {
          return new Response("Forbidden", { status: 403 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { createParticipant } = await import("@/lib/registry.server");
        const { persistDraft, sendDocument, respondToDocument } = await import(
          "@/lib/exchange.server"
        );
        const { raiseDispute } = await import("@/lib/queries.server");

        // 1. Demo auth user (idempotent).
        const list = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
        if (list.error) throw new Error(list.error.message);
        let user = list.data.users.find((u) => u.email === DEMO_EMAIL);

        if (!user) {
          const created = await supabaseAdmin.auth.admin.createUser({
            email: DEMO_EMAIL,
            password: DEMO_PASSWORD,
            email_confirm: true,
          });
          if (created.error) throw new Error(created.error.message);
          user = created.data.user!;
        }
        const userId = user.id;

        // Already seeded? Do nothing else.
        const existing = await supabaseAdmin
          .from("participants")
          .select("gstin")
          .eq("user_id", userId);
        if ((existing.data?.length ?? 0) > 0) {
          return Response.json({
            seeded: false,
            reason: "already seeded",
            email: DEMO_EMAIL,
          });
        }

        // 2. Both trading parties, each with a freshly minted P-256 key.
        for (const party of [SELLER, BUYER]) {
          await createParticipant(userId, {
            gstin: party.gstin,
            legalName: party.legalName,
            tradeName: party.tradeName,
            address: party.address,
            city: party.city,
            pincode: party.pincode,
            email: party.email,
            phone: party.phone,
          });
        }

        const nowIso = new Date().toISOString();
        const today = nowIso.slice(0, 10);

        // 3. Invoice: signed, sent, accepted → countersigned journal element.
        const invoiceId = crypto.randomUUID();
        await persistDraft(userId, {
          id: invoiceId,
          kind: "INVOICE",
          documentNumber: "INV-2026-0142",
          issueDate: today,
          currency: "INR",
          seller: SELLER,
          buyer: BUYER,
          lines: [
            {
              id: "l1",
              description: "Cotton shirting fabric 44in",
              hsn: "52081200",
              quantity: 1200,
              uom: "MTR",
              unitPrice: 148,
              discount: 0,
              taxRate: 5,
            },
            {
              id: "l2",
              description: "Polyester blended suiting",
              hsn: "54075200",
              quantity: 400,
              uom: "MTR",
              unitPrice: 265,
              discount: 2000,
              taxRate: 12,
            },
          ],
          paymentTermsDays: 45,
          notes: "Bulk order against annual rate contract.",
          references: { orderRef: "PO-2026-0044" },
        });
        await sendDocument(userId, invoiceId);

        const inboundInvoice = await supabaseAdmin
          .from("canonical_documents")
          .select("id")
          .eq("document_number", "INV-2026-0142")
          .eq("direction", "INBOUND")
          .maybeSingle();
        if (inboundInvoice.data) {
          await respondToDocument(userId, inboundInvoice.data.id, "ACCEPTED");
        }

        // 4. Purchase order issued by the buyer, awaiting a response.
        const orderId = crypto.randomUUID();
        await persistDraft(userId, {
          id: orderId,
          kind: "ORDER",
          documentNumber: "PO-2026-0051",
          issueDate: today,
          currency: "INR",
          seller: SELLER,
          buyer: BUYER,
          lines: [
            {
              id: "l1",
              description: "Cotton shirting fabric 44in",
              hsn: "52081200",
              quantity: 2000,
              uom: "MTR",
              unitPrice: 146,
              discount: 0,
              taxRate: 5,
            },
          ],
          paymentTermsDays: 30,
          notes: "Deliver in two tranches, Bengaluru DC.",
        });
        await sendDocument(userId, orderId);

        // 5. Draft credit note, ready to sign & send from the UI.
        await persistDraft(userId, {
          id: crypto.randomUUID(),
          kind: "CREDIT_NOTE",
          documentNumber: "CN-2026-0009",
          issueDate: today,
          currency: "INR",
          seller: SELLER,
          buyer: BUYER,
          lines: [
            {
              id: "l1",
              description: "Shade variation allowance on INV-2026-0142",
              hsn: "52081200",
              quantity: 80,
              uom: "MTR",
              unitPrice: 148,
              discount: 0,
              taxRate: 5,
            },
          ],
          paymentTermsDays: 0,
          references: { invoiceRef: "INV-2026-0142", reasonCode: "01" },
        });

        // 6. A disputed journal element so the dispute state is visible.
        const element = await supabaseAdmin
          .from("ledger_elements")
          .select("id")
          .eq("document_kind", "ORDER")
          .order("sequence", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (element.data) {
          await raiseDispute(
            userId,
            element.data.id,
            "Quantity on PO-2026-0051 does not match the rate contract schedule.",
          );
        }

        return Response.json({ seeded: true, email: DEMO_EMAIL });
      },
    },
  },
});

import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Trade Connect India — EDI exchange for MSMEs" },
      {
        name: "description",
        content:
          "Exchange GST-aligned invoices, orders, dispatch advice and payment advice as signed JSON, with a shared triple-entry journal both parties countersign.",
      },
      { property: "og:title", content: "Trade Connect India — EDI exchange for MSMEs" },
      {
        property: "og:description",
        content:
          "Signed, content-addressed trade documents for Indian MSMEs, with a countersigned shared journal instead of fuzzy reconciliation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const capabilities = [
  {
    title: "One canonical record",
    body: "Every document is stored canonically and content-hashed. GST e-invoice, e-way bill, ONDC and UN/EDIFACT payloads are projections of it, never the source of truth.",
  },
  {
    title: "Signed peer delivery",
    body: "ONDC-style envelopes with detached signatures. Inbound documents are verified against the sender's registered key before they reach an inbox.",
  },
  {
    title: "Shared triple-entry journal",
    body: "Buyer and seller book against one append-only entry and countersign it. Reconciliation becomes signature verification, not matching.",
  },
  {
    title: "Registry with key rotation",
    body: "GSTIN-checked participants, server-held private keys, and rotation that keeps in-flight signatures verifiable.",
  },
  {
    title: "Built for ERP and agents",
    body: "A typed RPC surface any connector — Tally, Zoho, or a fintech's AI agent — can drive against the same canonical model.",
  },
  {
    title: "Nothing is edited",
    body: "Revisions chain by hash and ledger tables reject updates and deletes at the database level. History is replayable.",
  },
];

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <span className="text-sm font-semibold tracking-tight">Trade Connect India</span>
          <Link
            to="/auth"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Open the exchange
          </Link>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 py-24">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent-foreground">
            Electronic data interchange · India
          </p>
          <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Structured trade data between MSMEs, signed at both ends.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
            Invoices, credit notes, purchase orders, dispatch advice and payment advice move as
            canonical JSON over signed envelopes — and land in a shared journal both counterparties
            have already agreed to.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              to="/auth"
              className="rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground"
            >
              Register a GSTIN
            </Link>
            <a
              href="#capabilities"
              className="rounded-md border px-6 py-3 text-sm font-medium"
            >
              How it works
            </a>
          </div>
        </section>

        <section id="capabilities" className="border-t bg-muted/30">
          <div className="mx-auto grid max-w-6xl gap-px bg-border px-0 py-0 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((c) => (
              <article key={c.title} className="bg-background p-8">
                <h2 className="text-base font-semibold">{c.title}</h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{c.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-tight">Standards posture</h2>
          <dl className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["GST e-invoice", "NIC schema v1.1 projection, INV and CRN, with an inverse mapping back to canonical."],
              ["ONDC / Beckn", "Peer-to-peer signed envelopes with idempotent delivery per document, revision and action."],
              ["e-way bill", "Dispatch advice carries the transport fields the EWB payload needs."],
              ["OCEN", "Countersigned journal entries give lenders verifiable receivables, not self-reported ones."],
            ].map(([term, detail]) => (
              <div key={term}>
                <dt className="text-sm font-semibold">{term}</dt>
                <dd className="mt-2 text-sm text-muted-foreground">{detail}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-6 py-8 text-xs text-muted-foreground">
          Trade Connect India — a working EDI node. Loopback transport enabled for local
          counterparties.
        </div>
      </footer>
    </div>
  );
}

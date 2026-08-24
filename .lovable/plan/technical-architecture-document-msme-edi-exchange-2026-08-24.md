# Technical Architecture Document — MSME EDI Exchange

Deliverable: a single PDF engineering specification of the whole infrastructure, generated
from the actual codebase (not an idealised design), written to `/mnt/documents` and
downloadable from chat.

## What the document covers

1. **Executive summary** — what the network does, who transacts on it, why canonical-core
   with profile projections was chosen over adopting IUDX wholesale.
2. **Standards evaluation** — IUDX vs ONDC/Beckn vs plain REST hub, scored against GST
   e-invoice, e-way bill, OCEN, ONDC and UN/EDIFACT alignment; what was borrowed from
   IUDX (catalogue registry, capability tokens, adaptor pattern) and what was rejected.
3. **System architecture** — layer diagram (Identity & Registry → Canonical Document →
   Profile/Adaptor → Exchange → Triple-entry Ledger → Application/Agent surface), plus a
   deployment view (browser, Worker runtime server functions, Postgres, public API routes).
4. **Canonical data model** — `CanonicalDocument`, `Party`, `LineItem`, `Transport`,
   `Envelope`, `LedgerElement`, `Participant`, with field tables and the Zod validation
   contract; revision chaining and content hashing rules.
5. **Identity, keys and signatures** — GSTIN mod-36 validation, per-participant P-256
   keypairs, keyId derivation, key rotation with an overlap window, detached signature
   over the body hash, registry-backed verification, and the algorithm-agnostic `Signer`
   seam for Ed25519 (ONDC) and RSA/X.509 (IRP).
6. **Exchange protocol** — envelope format, `submit → ack → on_response` sequence
   diagram, idempotency key derivation, status machine (DRAFT/SENT/ACKNOWLEDGED/
   ACCEPTED/REJECTED/FAILED), retry and dead-letter behaviour, loopback vs HTTP transport.
7. **Profile layer** — the `toProfile`/`fromProfile` codec contract, the GST e-invoice
   projection field map (canonical → NIC schema v1.1), the documented `droppedOnExport`
   set, round-trip test strategy, and stubs planned for e-way bill, OCEN, ONDC, EDIFACT.
8. **Triple-entry ledger** — Pacio-style shared journal element, account legs per document
   kind, event hash + prev hash + chain hash construction, derived status
   (PENDING_COUNTERSIGN / MATCHED / DISPUTED), append-only enforcement via revoked grants
   plus a BEFORE UPDATE OR DELETE trigger, chain verification and dispute handling.
9. **Database design** — table-by-table listing (participants, canonical_documents,
   document_revisions, envelopes, ledger_elements, ledger_disputes), columns, indexes,
   RLS policies scoped to participant GSTIN, and the explicit GRANT matrix.
10. **Server surface** — server-function inventory (registry, exchange, queries, read
    models), the client-safe vs server-only module boundary, and the public webhook routes
    under `api/public/edi/*` with signature-verify-before-parse ordering.
11. **Integration & agent surface** — connector interface for Zoho (per-user OAuth) and
    the cloud-side Tally bridge (pairing endpoint, scoped agent token, XML codec, queue),
    plus the capability manifest for fintech AI agents.
12. **Security model** — threat table (replay, forged sender, key compromise, tenant
    leakage, ledger tampering) with the control for each.
13. **Testing & verification** — current 34-test suite mapped to the components it guards.
14. **Roadmap** — phased build order and what is deliberately deferred (Merkle selective
    disclosure, EDIFACT D96A, agent rate limiting).

## How it will be produced

- Sources: `src/lib/canonical/*`, `src/lib/crypto.ts`, `src/lib/ledger/*`,
  `src/lib/profiles/*`, `src/lib/*.server.ts`, `src/lib/edi.functions.ts`, the applied
  Supabase migrations, and the two archived plan documents.
- Generated with a Python/ReportLab script: title page, table of contents, numbered
  sections, field tables, ASCII/vector architecture and sequence diagrams, monospace code
  and schema blocks, page headers/footers.
- Every architectural claim reflects code that exists; anything planned-but-unbuilt is
  labelled as such in a "status" column so the document is not aspirational fiction.
- QA: render each page to an image and inspect for clipping, overlap, table overflow and
  font issues; fix and re-render until clean.

Output: `/mnt/documents/msme-edi-technical-architecture.pdf`

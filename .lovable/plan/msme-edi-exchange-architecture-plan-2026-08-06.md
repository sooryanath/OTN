# MSME EDI Exchange — Architecture Plan

## The verdict on IUDX

Do not adopt the full IUDX stack. IUDX is built for **open data discovery and streaming from public data sources** (catalogue + resource server + auth server + Kafka/RabbitMQ pipelines). Its strengths are discovery metadata and time-series sharing. Its weaknesses for our use case are decisive:

- No notion of a **legally binding, mutually agreed document** (invoice, PO, e-way bill) with non-repudiation.
- No native mapping to GST/ONDC/OCEN/UN-EDIFACT semantics.
- Heavy deployment footprint (multiple Java services, Kafka, Zookeeper, Postgres, Redis, Elasticsearch) — too heavy for MSME-facing SaaS.

**What we take from IUDX** (the good ideas, reimplemented light):
1. **Catalogue-style resource registry** — every trading party and document type is a discoverable, versioned resource with a stable IRI.
2. **Token-scoped, capability-based access** — short-lived access tokens issued per resource per consumer (IUDX's auth model), not blanket API keys.
3. **Adaptor pattern** — pluggable ingestion adaptors instead of one monolithic parser.

## Better-aligned base: ONDC-style federated protocol as the spine

The architecture that actually aligns with GST e-invoice, ONDC, OCEN, e-way bill, and UN/EDIFACT is a **Beckn/ONDC-style peer-to-peer signed message protocol**, not a data-exchange hub:

| Requirement | ONDC/Beckn spine | IUDX hub |
|---|---|---|
| Two-party negotiated transaction | native | absent |
| Signed, non-repudiable payloads | Ed25519 signature headers, registry-backed key lookup | bearer token only |
| Government schema alignment | GST/OCEN both already Beckn-adjacent | none |
| MSME onboarding cost | one HTTPS callback endpoint | full stack |

So: **ONDC-style federated messaging + IUDX-style catalogue/auth ideas + Pacio triple-entry ledger as the settlement truth layer.**

## Recommendation 7 (the one we build on)

*Canonical semantic core with profile-based projections.* One internal canonical JSON trade document model; every external standard is a **profile** that projects to/from it. Never store a GST payload or an EDIFACT segment as the source of truth — store canonical, project on demand.

```text
                 ┌──────────────────────────────────────────┐
                 │        Canonical Trade Document           │
                 │  (JSON-LD, versioned, hash-addressed)     │
                 └───────────────┬──────────────────────────┘
        ┌────────────┬───────────┼───────────┬─────────────┐
        ▼            ▼           ▼           ▼             ▼
   GST e-Invoice  e-Way Bill   ONDC       OCEN         UN/EDIFACT
   (IRN/Schema)   (EWB API)   (Beckn)   (loan app)   (INVOIC/ORDERS)
        profile      profile   profile    profile      profile
```

## Layers

**1. Identity & Registry**
GSTIN-anchored participant registry. Each participant holds an Ed25519 keypair; public keys published in the registry. IUDX-style short-lived scoped tokens for API access; ONDC-style detached signatures for document authenticity.

**2. Canonical Document Layer**
JSON-LD documents (Order, Invoice, Dispatch, GRN, Payment Advice, Credit Note). Each is content-hashed; every revision is append-only. Zod schemas as the single validation authority.

**3. Profile / Adaptor Layer**
Bidirectional codecs, one module per standard: `gst-einvoice`, `eway-bill`, `ondc-beckn`, `ocen`, `edifact-d96a`. Each exposes `toProfile(canonical)` and `fromProfile(payload)`. Round-trip tested.

**4. Exchange Layer**
Async signed message envelopes over HTTPS callbacks (ONDC pattern): `submit → ack → on_response`. Idempotency keys, retry with backoff, dead-letter inspection UI.

**5. Triple-Entry Accounting Layer (Pacio)**
This is the differentiator. Pacio's model: a trade event produces **one shared, cryptographically signed entry** that both counterparties book against, rather than two independent double-entry records that must later be reconciled.

- Every accepted canonical document emits a **Pacio-style shared journal element**: `{ event_hash, debit_leg, credit_leg, both_party_signatures, timestamp }`.
- Both parties' ledgers derive from the same element — reconciliation becomes verification, not matching.
- Ledger is append-only and hash-chained; a party can prove its books to a lender (OCEN flow) or auditor without exposing the counterparty's full ledger — selective disclosure via per-element proofs.
- Reconciliation dashboard shows: matched (signed by both), pending counter-signature, disputed.
- Financing hook: signed, counter-acknowledged receivables become the collateral asset presented over OCEN.

**6. Application Surface**
MSME-facing web app: document composer, inbox/outbox, profile export (download GST JSON, EDIFACT flat file), ledger view, reconciliation board, financing tab, connector settings.

## Phasing

1. Canonical model + Zod schemas + document composer UI, `/` as the exchange dashboard.
2. Participant registry, keypairs, signing, inbox/outbox with signed envelopes.
3. Profiles: GST e-invoice first, then e-way bill, then EDIFACT INVOIC/ORDERS.
4. Pacio triple-entry ledger + reconciliation board.
5. ONDC and OCEN profiles + financing surface.

## Technical notes

- TanStack Start; canonical schemas in `src/lib/canonical/`, profiles in `src/lib/profiles/<standard>/`, ledger in `src/lib/ledger/`.
- Server functions (`*.functions.ts`) for signing, profile projection, and ledger append — signing keys never reach the browser.
- Webhook receipt endpoints under `src/routes/api/public/edi/*` with signature verification before any processing.
- Lovable Cloud (Postgres) for participants, documents, envelopes, ledger elements; RLS scoped to the participant's GSTIN, plus explicit GRANTs.
- Ledger tables are insert-only: no UPDATE/DELETE grants, corrections via reversing elements.
- Hashing/signing with WebCrypto (Ed25519) — Worker-runtime safe.

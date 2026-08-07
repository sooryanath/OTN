# Review of the MSME EDI Build Plan

Verdict: the plan is sound in structure — increment ordering, "done when" checks, and the
testing bar per stage are right, and the execution order (foundation → one document
end-to-end → GST → connector → ledger) is the order I'd pick too. Five items need
correcting before it's buildable on this stack, and a few need re-sequencing.

## Where the plan matches what already exists

Already in the repo (so B-1.1/B-1.2/B-5.1 are partially done, not greenfield):

- `src/lib/canonical/types.ts`, `schema.ts`, `totals.ts` — canonical document, envelope,
  ledger element, GST totals.
- `src/lib/crypto.ts` — deterministic canonical JSON + hashing + sign/verify.
- `src/lib/profiles/gst-einvoice.ts` — first profile projection.

Not yet present: Vitest, any database (Cloud is not enabled), any route beyond the
placeholder home page.

## Corrections needed

**1. Signature algorithm conflict (B-2.2).** The plan specifies Ed25519; the existing
`src/lib/crypto.ts` is ECDSA P-256. Pick one and make it the only one — ONDC/Beckn uses
Ed25519, GST/IRP uses RSA/X.509, so plan for a small algorithm-agnostic `Signer`
interface with P-256 as the internal default and Ed25519 added for the ONDC profile.
Don't leave two signing paths undeclared.

**2. Insert-only enforcement (B-7.1) can't be done with DB role grants.** Managed
Postgres does not hand us a custom app role to revoke UPDATE from — the app connects as
`authenticated`/`service_role`. Correct approach: `REVOKE UPDATE, DELETE` on the ledger
table from `authenticated`, no permissive UPDATE/DELETE RLS policy, plus a
`BEFORE UPDATE OR DELETE` trigger that raises — so it fails at the database even for
privileged callers. The test asserts the trigger raises, not a grant error.

**3. Zoho OAuth (B-6.1) should not be hand-rolled.** Storing encrypted refresh tokens
ourselves is the expensive, risky path. The platform has per-app-user connectors that own
the OAuth dance and token storage; use that, and keep `erp-zoho` limited to the
codec + sync logic. This deletes most of B-6.1.

**4. Tally local agent (B-8) is out of scope for this codebase.** It's a desktop binary
talking to a local XML-HTTP port — it can't be built or shipped from here. What *can* be
built is the cloud half: the pairing endpoint, the scoped agent token, the
`erp-tally` XML codec, and the push/pull queue the agent drains. Split B-8 into
"cloud-side Tally bridge" (in scope) and "agent binary" (separate repo, separate tooling).

**5. IRP submission (B-5.2) needs GSP credentials we don't have.** Plan it as an adapter
with a mock IRP implementation as the default so the flow is demoable and testable, and
the live sandbox becomes a config swap when credentials exist. Otherwise Stage 5 blocks.

## Re-sequencing

- **Add B-0.2: enable Cloud before Stage 1.** B-1.3 (tables + RLS) is a hard dependency
  and nothing persists until it exists.
- **Move the participant registry (B-2.1) ahead of B-1.3.** Document RLS keys off
  participant GSTIN; writing document policies before the registry exists means writing
  them twice.
- **Stage 4 needs a loopback mode.** "Two test participants exchanging documents"
  implies two deployed nodes. Make delivery pluggable with an in-process loopback
  transport as the default for tests and the demo, and HTTP delivery as the same
  interface. Without this, B-4.2/B-4.3 aren't testable in one environment.
- **MCP (B-10.2) is one server, not one per token.** The platform's MCP support is a
  single server whose tools resolve the caller from a verified OAuth token — scoping is
  per-call, not per-instance. The two-token disjoint-data test still applies and is the
  right check.
- **B-9.2 (ONDC/Beckn) — agreed it needs its own design pass.** It's a state machine over
  a transaction id, not a codec; keep it out of the profile folder's shape.

## What I'd cut from v1

- **B-7.4 selective disclosure / Merkle proofs.** Real value, but it only matters once
  there's a counterparty who wants to verify without trust. Ship the signed, chained
  ledger first; add the proof endpoint when the first LSP asks.
- **B-9.4 EDIFACT D96A.** Highest fixture burden, lowest near-term demand for Indian
  MSMEs. Keep the profile interface ready; build it on demand.
- **B-10.3 agent rate limiting.** There's no rate-limiting primitive here, so it's custom
  work. Note the gap, defer the build.

## Revised execution order

1. Stage 0 + enable Cloud + Vitest, replace the placeholder home page.
2. Registry (B-2.1/2.2/2.3) → canonical tables + RLS (B-1.3), finishing the schema files
   already started.
3. Composer + dashboard (Stage 3).
4. Exchange with loopback transport (Stage 4) — first demoable milestone.
5. GST e-invoice profile with mock IRP (Stage 5).
6. Ledger (Stage 7) — moved ahead of connectors; it's the differentiator and it only
   depends on Stage 4.
7. Zoho connector via the platform's user connectors (Stage 6).
8. Cloud-side Tally bridge, e-way bill, OCEN.
9. `/capabilities` + MCP server (Stage 10).

Ledger before connectors is the one order change I'd argue for: the ledger is what makes
this more than a document relay, and every connector added before it is a codec you may
end up revising once ledger semantics land.

## Technical notes

- Schemas stay single-source Zod with `z.infer` — the plan already says this; enforce it
  in review, since duplicated interfaces are the most likely drift.
- Document handlers go in `createServerFn` modules; only webhooks and the inbound EDI
  receiver need raw HTTP routes under `api/public/`, where signature verification must
  run before any parse or write (the plan gets this right in B-4.3).
- Test vectors for B-4.1 need a committed fixed test keypair; P-256 ECDSA is
  non-deterministic, so assert verify-passes rather than signature-byte equality.

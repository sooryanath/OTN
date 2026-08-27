# Demo profile with sign-in credentials

Goal: a ready-to-use mock account so you can sign in and immediately see a populated exchange — registered GSTINs, documents in flight, and a countersigned shared journal.

## Credentials you'll use

- Email: `demo@tradeconnect.in`
- Password: `TradeConnect#2026`

## What gets seeded

Two participants owned by the demo account, so both sides of a trade exist on the loopback transport:

- Sunrise Textiles Pvt Ltd (Maharashtra GSTIN) — seller
- Deccan Retail LLP (Karnataka GSTIN) — buyer

Each gets a freshly minted P-256 signing key through the existing registry logic (no hardcoded keys).

Then, using the real exchange code path (not fake rows):

- One invoice, signed and sent, already ACCEPTED by the buyer — produces countersigned journal elements with a verified hash chain
- One purchase order, sent and awaiting response — so the accept/reject buttons have something to act on
- One draft credit note — so the sign & send flow is demonstrable
- One disputed journal element — so the dispute state is visible

## How it works

A one-shot seed endpoint at `src/routes/api/public/seed-demo.ts`:

1. Creates the auth user via the admin client with email confirmation pre-set, so the credentials work immediately.
2. If the user already exists, it reuses it and skips reseeding (idempotent — safe to hit twice).
3. Calls the existing `createParticipant`, `persistDraft`, `sendDocument`, and `respondToDocument` functions so every signature, envelope, and ledger element is genuinely produced by the protocol.
4. Guarded by a shared seed token so it can't be triggered by a random caller.

I run it once after deploying it, then hand you the credentials. Nothing about the auth schema is touched directly and no production code paths change.

## Technical notes

- Seeding through server logic rather than a SQL migration is required here because private keys, content hashes, envelope signatures, and the ledger hash chain are all derived at runtime by WebCrypto — literal INSERTs would produce rows that fail chain verification.
- The endpoint lives under `api/public/*` (bypasses site auth) and verifies a `SEED_TOKEN` secret in-handler before doing anything.
- After seeding I'll drive the flow in the preview once to confirm the journal verifies and the inbound PO is actionable.

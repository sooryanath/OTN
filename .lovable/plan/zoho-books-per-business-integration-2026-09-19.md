# Zoho Books Per-Business Integration

## Goal

Allow each signed-in MSME to connect its own Zoho Books organisation and synchronize exchange documents without sharing credentials between businesses.

## Product flow

1. Add an Integrations area to the authenticated app with a Zoho Books connection status per registered GSTIN.
2. Start Zoho OAuth from a selected participant and preserve the signed-in user, GSTIN, return location, and anti-forgery state.
3. Handle the provider callback on a public callback endpoint, validate state, exchange the authorization code server-side, discover the Zoho organisation, and save the connection for that user/GSTIN.
4. Let the user disconnect or reconnect one GSTIN without affecting other businesses.
5. Add document actions for accepted invoices, credit/debit notes, purchase orders, and dispatch/delivery notes.
6. Add import-status actions that read Zoho invoice/payment state and display the latest sync result in the exchange.

## Synchronization scope

- Outbound canonical `INVOICE` → Zoho invoice.
- Outbound canonical `CREDIT_NOTE` → Zoho credit note.
- Outbound canonical `ORDER` → Zoho purchase order, using the canonical buyer/seller role and references.
- Outbound canonical `DISPATCH` → Zoho delivery note where the selected Zoho organisation supports that resource.
- Inbound Zoho invoice/payment status → a non-destructive sync record and visible status on the related exchange document.
- Use GSTIN and document number as matching keys; never create duplicate Zoho records when a prior sync exists.
- Keep the canonical exchange document and shared journal as the source of truth; Zoho remains an accounting projection.

## Security and data model

- Use a custom Zoho OAuth flow because no Zoho App User Connector is available in this workspace.
- Keep Zoho client credentials server-only through secure project secrets; never place them in browser code or committed files.
- Store each participant’s Zoho organisation, access-token metadata, encrypted refresh token, scopes, and connection status in a dedicated table keyed by the authenticated user and GSTIN.
- Encrypt refresh tokens with a generated application encryption secret; never log tokens or return them to the browser.
- Protect callback state with signed, short-lived state data and bind it to the authenticated user and selected GSTIN.
- Add explicit table grants, RLS policies, and indexes for user/GSTIN ownership. Disconnect removes or invalidates the stored connection without deleting exchange history.

## Server and UI work

- Add server functions for connection status, OAuth start, disconnect, sync document, and import status.
- Add public callback routes only for the OAuth provider callback; validate all query parameters and reject invalid or expired state.
- Add a server-only Zoho client with data-center configuration, token refresh, organisation lookup, and provider-error handling that preserves Zoho’s status and message.
- Add profile mapping and validation for Zoho invoices, credit notes, purchase orders, and delivery notes, including Indian GST fields and calculated totals.
- Add an integration panel and document-level sync/status controls using existing design-system components and authenticated server calls.
- Add idempotency and sync audit records so retries are safe and failures remain visible.

## Verification

- Unit-test canonical-to-Zoho mappings, GST/tax totals, document matching, idempotency, and provider error handling.
- Test OAuth state rejection, token refresh, per-user/per-GSTIN isolation, disconnect behavior, and duplicate prevention.
- Verify the UI with the existing demo account in a setup-needed state when Zoho credentials are not configured.
- After implementation, run the project checks and inspect the preview for the connection, sync, failure, and disconnected states.

## Required setup before live OAuth testing

A Zoho Books OAuth application is required with the callback URL:

```text
https://connector-gateway.lovable.dev/api/v1/app-users/oauth2/callback
```

For this custom per-business flow, the project will instead expose its own callback route, so the final Zoho redirect URI will be supplied after implementation and must be registered in the Zoho developer console. The Zoho client ID, client secret, and data-center choice must be stored securely before live connection testing.

## Technical details

- Keep integration modules under client-safe `*.functions.ts` wrappers plus server-only `*.server.ts` helpers.
- Use TanStack Start server routes for the OAuth callback and `createServerFn` for authenticated app operations.
- Use the existing canonical document/profile boundaries rather than duplicating document schemas.
- Do not use the workspace Zoho Books connector for runtime data because the requested model is one Zoho account per business, not one shared workspace account.

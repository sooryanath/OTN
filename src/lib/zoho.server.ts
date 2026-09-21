import { createHmac, timingSafeEqual } from "node:crypto";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computeTotals } from "@/lib/canonical/totals";
import { rowToCanonical, type DocumentRow } from "@/lib/canonical/mapper";
import type { CanonicalDocument, DocKind, Party } from "@/lib/canonical/types";

type ZohoDataCenter = "in" | "com" | "eu" | "com.au" | "jp";
type ZohoConnectionRow = {
  access_token_encrypted: string;
  organization_id: string;
  data_center: ZohoDataCenter;
};

type ZohoTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

const encoder = new TextEncoder();

function b64(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function unb64(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function requiredConfig() {
  const clientId = process.env["ZOHO_CLIENT_ID"];
  const clientSecret = process.env["ZOHO_CLIENT_SECRET"];
  const redirectUri = process.env["ZOHO_REDIRECT_URI"];
  const stateSecret = process.env["ZOHO_OAUTH_STATE_SECRET"];
  if (!clientId || !clientSecret || !redirectUri || !stateSecret) {
    throw new Error(
      "Zoho Books is not configured yet. Add the Zoho client credentials, callback URL, and state secret.",
    );
  }
  return { clientId, clientSecret, redirectUri, stateSecret };
}

function accountsBase(dataCenter: ZohoDataCenter) {
  return `https://accounts.zoho.${dataCenter}`;
}

function apiBase(dataCenter: ZohoDataCenter) {
  return `https://www.zohoapis.${dataCenter}/books/v3`;
}

function makeState(payload: Record<string, string>) {
  const { stateSecret } = requiredConfig();
  const body = b64(JSON.stringify({ ...payload, exp: String(Date.now() + 10 * 60_000) }));
  const signature = createHmac("sha256", stateSecret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function readState(value: string): Record<string, string> {
  const { stateSecret } = requiredConfig();
  const [body, signature] = value.split(".");
  if (!body || !signature) throw new Error("Invalid Zoho OAuth state");
  const expected = createHmac("sha256", stateSecret).update(body).digest("base64url");
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) {
    throw new Error("Invalid Zoho OAuth state");
  }
  const payload = JSON.parse(unb64(body)) as Record<string, string>;
  if (!payload.exp || Number(payload.exp) < Date.now()) throw new Error("Expired Zoho OAuth state");
  return payload;
}

async function encryptionKey() {
  const secret = process.env["ZOHO_TOKEN_ENCRYPTION_KEY"];
  if (!secret) throw new Error("Zoho token encryption is not configured");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptToken(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    encoder.encode(value),
  );
  return `${Buffer.from(iv).toString("base64url")}.${Buffer.from(cipher).toString("base64url")}`;
}

async function decryptToken(value: string) {
  const [iv, cipher] = value.split(".");
  if (!iv || !cipher) throw new Error("Invalid encrypted Zoho token");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: Buffer.from(iv, "base64url") },
    await encryptionKey(),
    Buffer.from(cipher, "base64url"),
  );
  return new TextDecoder().decode(plain);
}

async function providerFetch<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!response.ok) {
    console.error(`Zoho request failed [${response.status}]: ${text}`);
    throw new Error(`Zoho request failed [${response.status}]`);
  }
  if (typeof body === "object" && body !== null && "code" in body && body.code !== 0) {
    const message = "message" in body && typeof body.message === "string" ? body.message : "Provider rejected the request";
    throw new Error(`Zoho request failed: ${message}`);
  }
  return body as T;
}

export async function listZohoConnections(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("zoho_books_connections")
    .select("gstin, organization_id, organization_name, data_center, status, last_error, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function beginZohoConnection(userId: string, gstin: string, returnTo: string) {
  const { clientId, redirectUri } = requiredConfig();
  const { data: participant, error } = await supabaseAdmin
    .from("participants")
    .select("gstin")
    .eq("gstin", gstin)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!participant) throw new Error("You do not control this GSTIN");

  const dataCenter = (process.env["ZOHO_DATA_CENTER"] ?? "in") as ZohoDataCenter;
  const state = makeState({ userId, gstin, returnTo: returnTo.startsWith("/") ? returnTo : "/app" });
  const url = new URL(`${accountsBase(dataCenter)}/oauth/v2/auth`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "ZohoBooks.fullaccess.all");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return { authorizationUrl: url.toString() };
}

export async function disconnectZoho(userId: string, gstin: string) {
  const { error } = await supabaseAdmin
    .from("zoho_books_connections")
    .delete()
    .eq("user_id", userId)
    .eq("gstin", gstin);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function handleZohoCallback(code: string, stateValue: string) {
  const state = readState(stateValue);
  const { clientId, clientSecret, redirectUri } = requiredConfig();
  const dataCenter = (process.env["ZOHO_DATA_CENTER"] ?? "in") as ZohoDataCenter;
  const tokens = await providerFetch<ZohoTokenResponse>(`${accountsBase(dataCenter)}/oauth/v2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokens.refresh_token) throw new Error("Zoho did not return a refresh token; reconnect with consent");

  const organizations = await providerFetch<{
    organizations?: Array<{ organization_id: string; name: string }>;
  }>(`${apiBase(dataCenter)}/organizations`, {
    headers: { Authorization: `Zoho-oauthtoken ${tokens.access_token}` },
  });
  const organization = organizations.organizations?.[0];
  if (!organization) throw new Error("No Zoho Books organization was found");

  const { error } = await supabaseAdmin.from("zoho_books_connections").upsert(
    {
      user_id: state.userId,
      gstin: state.gstin,
      organization_id: organization.organization_id,
      organization_name: organization.name,
      data_center: dataCenter,
      access_token_encrypted: await encryptToken(tokens.access_token),
      refresh_token_encrypted: await encryptToken(tokens.refresh_token),
      access_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scopes: ["ZohoBooks.fullaccess.all"],
      status: "CONNECTED",
      last_error: null,
    },
    { onConflict: "user_id,gstin" },
  );
  if (error) throw new Error(error.message);
  return state.returnTo || "/app";
}

function resourceFor(kind: DocKind) {
  if (kind === "INVOICE") return "invoices";
  if (kind === "CREDIT_NOTE") return "creditnotes";
  if (kind === "ORDER") return "purchaseorders";
  if (kind === "DISPATCH") return "deliverychallans";
  throw new Error(`${kind} is not supported by the Zoho Books projection yet`);
}

function partyName(party: Party) {
  return party.tradeName || party.legalName;
}

function zohoPayload(document: CanonicalDocument) {
  const totals = computeTotals(document);
  return {
    customer_name: partyName(document.buyer),
    vendor_name: partyName(document.seller),
    reference_number: document.documentNumber,
    date: document.issueDate,
    notes: document.notes,
    line_items: document.lines.map((line) => ({
      name: line.description,
      description: `${line.description} · HSN ${line.hsn}`,
      quantity: line.quantity,
      rate: line.unitPrice,
      discount: line.discount,
      tax_percentage: line.taxRate,
    })),
    gst_treatment: "business_gst",
    gst_no: document.seller.gstin,
    place_of_supply: document.buyer.stateCode,
    total: totals.grandTotal,
  };
}

export async function syncZohoDocument(userId: string, documentId: string) {
  const { data: row, error: documentError } = await supabaseAdmin
    .from("canonical_documents")
    .select("*")
    .eq("id", documentId)
    .eq("created_by", userId)
    .maybeSingle();
  if (documentError) throw new Error(documentError.message);
  if (!row) throw new Error("Document not found");
  const document = rowToCanonical(row as DocumentRow);
  const gstin = document.seller.gstin;
  const { data: connection, error: connectionError } = await supabaseAdmin
    .from("zoho_books_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("gstin", gstin)
    .maybeSingle();
  if (connectionError) throw new Error(connectionError.message);
  if (!connection) throw new Error(`Connect Zoho Books for ${gstin} before syncing`);

  const resource = resourceFor(document.kind);
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("zoho_books_sync_records")
    .select("zoho_record_id, status")
    .eq("document_id", documentId)
    .eq("resource", resource)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing?.status === "SYNCED" && existing.zoho_record_id) return existing;

  const token = await decryptToken((connection as ZohoConnectionRow).access_token_encrypted);
  const organizationId = encodeURIComponent(connection.organization_id);
  const response = await providerFetch<Record<string, unknown>>(
    `${apiBase(connection.data_center as ZohoDataCenter)}/${resource}?organization_id=${organizationId}`,
    {
      method: "POST",
      headers: { Authorization: `Zoho-oauthtoken ${token}`, "content-type": "application/json" },
      body: JSON.stringify(zohoPayload(document)),
    },
  );
  const record = Object.values(response).find(
    (value): value is Record<string, string> => typeof value === "object" && value !== null && Object.keys(value).some((key) => key.endsWith("_id")),
  );
  const providerId = record ? Object.entries(record).find(([key]) => key.endsWith("_id"))?.[1] ?? null : null;
  const { error: syncError } = await supabaseAdmin.from("zoho_books_sync_records").upsert(
    {
      user_id: userId,
      gstin,
      document_id: documentId,
      resource,
      zoho_record_id: providerId,
      status: "SYNCED",
      provider_status: "created",
      error_message: null,
      synced_at: new Date().toISOString(),
    },
    { onConflict: "document_id,resource" },
  );
  if (syncError) throw new Error(syncError.message);
  return { status: "SYNCED", zoho_record_id: providerId };
}
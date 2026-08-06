/**
 * Hashing and detached-signature helpers.
 *
 * Content addressing uses SHA-256 over a deterministically serialised body.
 * Signatures use ECDSA P-256 (WebCrypto, available in every current browser
 * and in the Worker runtime). The registry publishes public keys as JWK, the
 * same shape ONDC uses for registry-backed key lookup.
 */

const encoder = new TextEncoder();

/** Deterministic JSON: object keys sorted recursively so hashes are stable. */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return toHex(digest);
}

export async function hashObject(value: unknown): Promise<string> {
  return sha256Hex(canonicalize(value));
}

export function toBase64(bytes: ArrayBuffer): string {
  let binary = "";
  const view = new Uint8Array(bytes);
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

const ALGO = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGN_PARAMS = { name: "ECDSA", hash: { name: "SHA-256" } } as const;

export type KeyMaterial = {
  keyId: string;
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;
};

export async function generateKeyMaterial(): Promise<KeyMaterial> {
  const pair = await crypto.subtle.generateKey(ALGO, true, ["sign", "verify"]);
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const keyId = (await sha256Hex(canonicalize(publicKeyJwk))).slice(0, 16);
  return { keyId, publicKeyJwk, privateKeyJwk };
}

export async function signHash(privateKeyJwk: JsonWebKey, digestHex: string): Promise<string> {
  const key = await crypto.subtle.importKey("jwk", privateKeyJwk, ALGO, false, ["sign"]);
  const signature = await crypto.subtle.sign(SIGN_PARAMS, key, encoder.encode(digestHex));
  return toBase64(signature);
}

export async function verifyHash(
  publicKeyJwk: JsonWebKey,
  digestHex: string,
  signature: string,
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey("jwk", publicKeyJwk, ALGO, false, ["verify"]);
    return await crypto.subtle.verify(
      SIGN_PARAMS,
      key,
      fromBase64(signature) as unknown as ArrayBuffer,
      encoder.encode(digestHex),
    );
  } catch {
    return false;
  }
}

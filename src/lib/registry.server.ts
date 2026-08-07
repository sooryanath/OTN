import type { Json } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { generateKeyMaterial, signHash, verifyHash } from "@/lib/crypto";
import { checkGstin, gstinStateCode } from "@/lib/gstin";

/**
 * Registry internals. Private keys live here and never leave the server:
 * the only thing that crosses the wire is a signature.
 */

export type ParticipantInput = {
  gstin: string;
  legalName: string;
  tradeName?: string;
  address: string;
  city: string;
  pincode: string;
  email?: string;
  phone?: string;
  endpoint?: string;
  profiles?: string[];
};

export async function createParticipant(userId: string, input: ParticipantInput) {
  const gstin = input.gstin.trim().toUpperCase();
  const check = checkGstin(gstin);
  if (!check.ok) throw new Error(`Invalid GSTIN: ${check.reason}`);

  const key = await generateKeyMaterial();

  const { data, error } = await supabaseAdmin
    .from("participants")
    .insert({
      gstin,
      user_id: userId,
      legal_name: input.legalName,
      trade_name: input.tradeName ?? null,
      state_code: gstinStateCode(gstin),
      address: input.address,
      city: input.city,
      pincode: input.pincode,
      email: input.email ?? null,
      phone: input.phone ?? null,
      endpoint: input.endpoint ?? "loopback",
      key_id: key.keyId,
      public_key_jwk: key.publicKeyJwk as unknown as Json,
      profiles: input.profiles ?? ["gst-einvoice"],
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  const { error: keyError } = await supabaseAdmin.from("participant_private_keys").insert({
    gstin,
    key_id: key.keyId,
    private_key_jwk: key.privateKeyJwk as unknown as Json,
  });
  if (keyError) throw new Error(keyError.message);

  return data;
}

/**
 * Rotate to a fresh key. The previous key stays valid so signatures already in
 * flight still verify — it is recorded in rotated_keys, not deleted.
 */
export async function rotateParticipantKey(userId: string, gstin: string) {
  const { data: participant, error } = await supabaseAdmin
    .from("participants")
    .select("*")
    .eq("gstin", gstin)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!participant) throw new Error("Participant not found for this account");

  const next = await generateKeyMaterial();
  const rotated = Array.isArray(participant.rotated_keys) ? participant.rotated_keys : [];
  const history = participant.key_id
    ? [
        ...rotated,
        {
          keyId: participant.key_id,
          publicKeyJwk: participant.public_key_jwk,
          retiredAt: new Date().toISOString(),
        },
      ]
    : rotated;

  await supabaseAdmin.from("participant_private_keys").insert({
    gstin,
    key_id: next.keyId,
    private_key_jwk: next.privateKeyJwk as unknown as Json,
  });

  await supabaseAdmin
    .from("participant_private_keys")
    .update({ active: false })
    .eq("gstin", gstin)
    .neq("key_id", next.keyId);

  const { data, error: updateError } = await supabaseAdmin
    .from("participants")
    .update({
      key_id: next.keyId,
      public_key_jwk: next.publicKeyJwk as unknown as Json,
      rotated_keys: history as unknown as Json,
    })
    .eq("gstin", gstin)
    .select()
    .single();
  if (updateError) throw new Error(updateError.message);

  return data;
}

export async function signAsParticipant(gstin: string, digestHex: string) {
  const { data, error } = await supabaseAdmin
    .from("participant_private_keys")
    .select("key_id, private_key_jwk")
    .eq("gstin", gstin)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error(`No signing key registered for ${gstin}`);

  const signature = await signHash(data.private_key_jwk as JsonWebKey, digestHex);
  return { signature, keyId: data.key_id };
}

/**
 * Verify against the sender's registered key — the active one, or any key still
 * inside its rotation overlap window.
 */
export async function verifyAsParticipant(
  gstin: string,
  digestHex: string,
  signature: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("participants")
    .select("public_key_jwk, rotated_keys")
    .eq("gstin", gstin)
    .maybeSingle();

  if (error || !data?.public_key_jwk) return false;

  if (await verifyHash(data.public_key_jwk as JsonWebKey, digestHex, signature)) return true;

  const rotated = (Array.isArray(data.rotated_keys) ? data.rotated_keys : []) as {
    publicKeyJwk?: JsonWebKey;
  }[];
  for (const entry of rotated) {
    if (entry.publicKeyJwk && (await verifyHash(entry.publicKeyJwk, digestHex, signature))) {
      return true;
    }
  }
  return false;
}

export async function assertOwnsGstin(userId: string, gstin: string) {
  const { data, error } = await supabaseAdmin
    .from("participants")
    .select("gstin")
    .eq("user_id", userId)
    .eq("gstin", gstin)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("You do not control that GSTIN");
}

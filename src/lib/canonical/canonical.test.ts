import { describe, expect, it } from "vitest";

import { canonicalize, generateKeyMaterial, hashObject, signHash, verifyHash } from "@/lib/crypto";
import { computeContentHash, nextRevision } from "@/lib/canonical/revision";
import { canonicalDocumentSchema } from "@/lib/canonical/schema";

import { simpleInvoice } from "../__fixtures__/documents";

describe("canonicalisation and hashing", () => {
  it("is key-order independent", () => {
    const a = { b: 1, a: { d: 2, c: [1, 2] } };
    const b = { a: { c: [1, 2], d: 2 }, b: 1 };
    expect(canonicalize(a)).toBe(canonicalize(b));
  });

  it("drops undefined values so optional fields do not change the hash", async () => {
    expect(await hashObject({ a: 1, b: undefined })).toBe(await hashObject({ a: 1 }));
  });

  it("produces the same content hash for the same document written differently", async () => {
    const doc = simpleInvoice();
    const reordered = { ...doc, lines: [...doc.lines] };
    expect(await computeContentHash(doc)).toBe(await computeContentHash(reordered));
  });

  it("changes the hash when business content changes", async () => {
    const doc = simpleInvoice();
    const changed = simpleInvoice({ documentNumber: "INV-2026-9999" });
    expect(await computeContentHash(doc)).not.toBe(await computeContentHash(changed));
  });
});

describe("revision chaining", () => {
  it("links each revision to the hash it came from", async () => {
    const base = simpleInvoice();
    const v0 = { ...base, contentHash: await computeContentHash(base) };

    const { document: v1, revision } = await nextRevision(
      v0,
      { notes: "Revised delivery schedule" },
      { authorGstin: v0.seller.gstin },
    );

    expect(v1.revision).toBe(1);
    expect(revision.prevHash).toBe(v0.contentHash);
    expect(revision.contentHash).toBe(v1.contentHash);
    expect(v1.contentHash).not.toBe(v0.contentHash);
    expect(v1.id).toBe(v0.id);
  });
});

describe("signatures", () => {
  it("round-trips a signature over a document hash", async () => {
    const key = await generateKeyMaterial();
    const digest = await computeContentHash(simpleInvoice());
    const signature = await signHash(key.privateKeyJwk, digest);
    expect(await verifyHash(key.publicKeyJwk, digest, signature)).toBe(true);
  });

  it("rejects a signature over a tampered hash", async () => {
    const key = await generateKeyMaterial();
    const digest = await computeContentHash(simpleInvoice());
    const signature = await signHash(key.privateKeyJwk, digest);
    const tampered = digest.replace(/^.{1}/, (c) => (c === "a" ? "b" : "a"));
    expect(await verifyHash(key.publicKeyJwk, tampered, signature)).toBe(false);
  });

  it("rejects a signature from a different key", async () => {
    const mine = await generateKeyMaterial();
    const theirs = await generateKeyMaterial();
    const digest = await computeContentHash(simpleInvoice());
    const signature = await signHash(theirs.privateKeyJwk, digest);
    expect(await verifyHash(mine.publicKeyJwk, digest, signature)).toBe(false);
  });
});

describe("canonical schema", () => {
  it("accepts a valid invoice", () => {
    expect(canonicalDocumentSchema.safeParse(simpleInvoice()).success).toBe(true);
  });

  it("rejects an invoice with no line items", () => {
    expect(canonicalDocumentSchema.safeParse(simpleInvoice({ lines: [] })).success).toBe(false);
  });

  it("rejects a malformed GSTIN", () => {
    const bad = simpleInvoice();
    const result = canonicalDocumentSchema.safeParse({
      ...bad,
      buyer: { ...bad.buyer, gstin: "27AAPFU0939F1Z" },
    });
    expect(result.success).toBe(false);
  });
});

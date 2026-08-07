import { hashObject } from "@/lib/crypto";

import type { CanonicalDocument } from "./types";

/**
 * The hashable body of a document: everything that carries meaning, with the
 * fields that are *about* the record (id, timestamps, the hash itself) removed.
 * Two documents with identical business content hash identically, whatever
 * order their keys arrived in.
 */
export function documentBody(doc: CanonicalDocument): Record<string, unknown> {
  const { id: _id, contentHash: _hash, createdAt: _createdAt, ...body } = doc;
  return body as Record<string, unknown>;
}

export async function computeContentHash(doc: CanonicalDocument): Promise<string> {
  return hashObject(documentBody(doc));
}

export type Revision = {
  documentId: string;
  revision: number;
  prevHash: string | null;
  contentHash: string;
  body: Record<string, unknown>;
  authorGstin: string;
  origin: string;
  /** false = a counterparty/ERP change proposed against a signed document. */
  accepted: boolean;
};

/**
 * Produce the next revision of a document. The new revision always references
 * the hash it was derived from, so the chain can be replayed and no edit can
 * quietly replace history.
 */
export async function nextRevision(
  prior: CanonicalDocument,
  patch: Partial<CanonicalDocument>,
  options: { authorGstin: string; origin?: string; accepted?: boolean },
): Promise<{ document: CanonicalDocument; revision: Revision }> {
  const merged: CanonicalDocument = {
    ...prior,
    ...patch,
    id: prior.id,
    revision: prior.revision + 1,
    createdAt: prior.createdAt,
  };
  const contentHash = await computeContentHash(merged);
  const document = { ...merged, contentHash };

  return {
    document,
    revision: {
      documentId: prior.id,
      revision: document.revision,
      prevHash: prior.contentHash,
      contentHash,
      body: documentBody(document),
      authorGstin: options.authorGstin,
      origin: options.origin ?? "composer",
      accepted: options.accepted ?? true,
    },
  };
}

/**
 * A change arriving from an ERP or counterparty against a document that is no
 * longer a draft is a *proposal*: the signed document is never overwritten.
 */
export function isProposalOnly(status: string): boolean {
  return status !== "DRAFT";
}

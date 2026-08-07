import { describe, expect, it } from "vitest";

import { checkGstin, gstinCheckCharacter, isValidGstin, stateName } from "@/lib/gstin";

describe("GSTIN validation", () => {
  it("accepts well-formed GSTINs with a correct check character", () => {
    expect(isValidGstin("27AAPFU0939F1ZV")).toBe(true);
    expect(isValidGstin("29AACCM9910C1ZH")).toBe(true);
  });

  it("normalises case and whitespace", () => {
    expect(isValidGstin("  27aapfu0939f1zv ")).toBe(true);
  });

  it("rejects a wrong check character", () => {
    const result = checkGstin("27AAPFU0939F1ZA");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("Checksum");
  });

  it("rejects wrong length and wrong structure", () => {
    expect(isValidGstin("27AAPFU0939F1Z")).toBe(false);
    expect(isValidGstin("2AAPFU0939F1ZVX")).toBe(false);
  });

  it("derives the check character deterministically", () => {
    expect(gstinCheckCharacter("27AAPFU0939F1Z")).toBe("V");
  });

  it("names states from their code", () => {
    expect(stateName("27")).toBe("Maharashtra");
    expect(stateName("29")).toBe("Karnataka");
  });
});

/**
 * GSTIN structural + checksum validation.
 *
 * A GSTIN is 15 characters: 2-digit state code, 10-character PAN,
 * 1 entity number, a literal "Z", and a mod-36 check character.
 */

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export function gstinCheckCharacter(first14: string): string {
  let sum = 0;
  for (let i = 0; i < first14.length; i += 1) {
    const value = ALPHABET.indexOf(first14[i]!);
    if (value < 0) throw new Error(`Invalid GSTIN character at position ${i + 1}`);
    const factor = i % 2 === 0 ? 1 : 2;
    const product = value * factor;
    sum += Math.floor(product / 36) + (product % 36);
  }
  return ALPHABET[(36 - (sum % 36)) % 36]!;
}

export type GstinCheck = { ok: true } | { ok: false; reason: string };

export function checkGstin(raw: string): GstinCheck {
  const gstin = raw.trim().toUpperCase();
  if (gstin.length !== 15) return { ok: false, reason: "GSTIN must be exactly 15 characters" };
  if (!GSTIN_REGEX.test(gstin)) return { ok: false, reason: "GSTIN format is invalid" };
  const expected = gstinCheckCharacter(gstin.slice(0, 14));
  if (expected !== gstin[14]) {
    return { ok: false, reason: `Checksum failed — last character should be ${expected}` };
  }
  return { ok: true };
}

export function isValidGstin(raw: string): boolean {
  return checkGstin(raw).ok;
}

/** State code -> state name, used for place-of-supply display. */
export const STATE_CODES: Record<string, string> = {
  "01": "Jammu & Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra & Nagar Haveli and Daman & Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman & Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
};

export function stateName(code: string): string {
  return STATE_CODES[code] ?? `State ${code}`;
}

/** Derive the state code from a GSTIN (first two digits). */
export function gstinStateCode(gstin: string): string {
  return gstin.slice(0, 2);
}

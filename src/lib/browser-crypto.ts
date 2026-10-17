import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { ed25519 } from "@noble/curves/ed25519.js";

/**
 * Universal (Browser + Server) canonical JSON sorting.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort()) {
      const val = src[key];
      if (val === undefined) continue;
      out[key] = sortValue(val);
    }
    return out;
  }
  return value;
}

/** Compute sha256 hex string from string or Uint8Array */
export function sha256Hex(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  return bytesToHex(sha256(bytes));
}

/** termsHash as sha256:<hex> */
export function computeTermsHash(terms: unknown): string {
  return `sha256:${sha256Hex(canonicalize(terms))}`;
}

// Base64url helpers
function uint8ToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = typeof btoa !== "undefined" ? btoa(binary) : Buffer.from(bytes).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToUint8(base64url: string): Uint8Array {
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  if (typeof atob !== "undefined") {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  return new Uint8Array(Buffer.from(base64, "base64"));
}

export interface UniversalKeyPair {
  publicKeyRaw: string; // base64url 32-byte public key
  secretKey: Uint8Array;
}

export function generateUniversalKeyPair(): UniversalKeyPair {
  const pair = ed25519.keygen();
  return {
    publicKeyRaw: uint8ToBase64Url(pair.publicKey),
    secretKey: pair.secretKey,
  };
}

export function signUniversalValue(value: unknown, secretKey: Uint8Array): string {
  const payload = new TextEncoder().encode(canonicalize(value));
  const sigBytes = ed25519.sign(payload, secretKey);
  return uint8ToBase64Url(sigBytes);
}

export function verifyUniversalSignature(
  value: unknown,
  sigB64u: string,
  pubKeyB64u: string,
): boolean {
  try {
    const payload = new TextEncoder().encode(canonicalize(value));
    const sigBytes = base64UrlToUint8(sigB64u);
    const pubBytes = base64UrlToUint8(pubKeyB64u);
    return ed25519.verify(sigBytes, payload, pubBytes);
  } catch {
    return false;
  }
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalize = canonicalize;
exports.sha256Hex = sha256Hex;
exports.computeTermsHash = computeTermsHash;
exports.generateUniversalKeyPair = generateUniversalKeyPair;
exports.signUniversalValue = signUniversalValue;
exports.verifyUniversalSignature = verifyUniversalSignature;
const sha2_js_1 = require("@noble/hashes/sha2.js");
const utils_js_1 = require("@noble/hashes/utils.js");
const ed25519_js_1 = require("@noble/curves/ed25519.js");
/**
 * Universal (Browser + Server) canonical JSON sorting.
 */
function canonicalize(value) {
    return JSON.stringify(sortValue(value));
}
function sortValue(value) {
    if (Array.isArray(value))
        return value.map(sortValue);
    if (value !== null && typeof value === "object") {
        const src = value;
        const out = {};
        for (const key of Object.keys(src).sort()) {
            const val = src[key];
            if (val === undefined)
                continue;
            out[key] = sortValue(val);
        }
        return out;
    }
    return value;
}
/** Compute sha256 hex string from string or Uint8Array */
function sha256Hex(input) {
    const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
    return (0, utils_js_1.bytesToHex)((0, sha2_js_1.sha256)(bytes));
}
/** termsHash as sha256:<hex> */
function computeTermsHash(terms) {
    return `sha256:${sha256Hex(canonicalize(terms))}`;
}
// Base64url helpers
function uint8ToBase64Url(bytes) {
    let binary = "";
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    const base64 = typeof btoa !== "undefined" ? btoa(binary) : Buffer.from(bytes).toString("base64");
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function base64UrlToUint8(base64url) {
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
function generateUniversalKeyPair() {
    const pair = ed25519_js_1.ed25519.keygen();
    return {
        publicKeyRaw: uint8ToBase64Url(pair.publicKey),
        secretKey: pair.secretKey,
    };
}
function signUniversalValue(value, secretKey) {
    const payload = new TextEncoder().encode(canonicalize(value));
    const sigBytes = ed25519_js_1.ed25519.sign(payload, secretKey);
    return uint8ToBase64Url(sigBytes);
}
function verifyUniversalSignature(value, sigB64u, pubKeyB64u) {
    try {
        const payload = new TextEncoder().encode(canonicalize(value));
        const sigBytes = base64UrlToUint8(sigB64u);
        const pubBytes = base64UrlToUint8(pubKeyB64u);
        return ed25519_js_1.ed25519.verify(sigBytes, payload, pubBytes);
    }
    catch (_a) {
        return false;
    }
}

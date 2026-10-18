"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalize = canonicalize;
exports.termsHash = termsHash;
const node_crypto_1 = require("node:crypto");
/**
 * Canonical JSON for hashing and signing.
 *
 * Rules (pinned, so every party computes the same bytes):
 *  - object keys sorted ascending (code-unit order)
 *  - `undefined` values dropped
 *  - arrays keep their order
 *  - UTF-8 encoding
 *
 * Any party can recompute a result card's hash from `terms` alone with this
 * function — that is the whole point of the hash field.
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
/** `sha256:<hex>` over the canonical form of `terms`. Independently recomputable. */
function termsHash(terms) {
    const digest = (0, node_crypto_1.createHash)("sha256").update(canonicalize(terms), "utf8").digest("hex");
    return `sha256:${digest}`;
}

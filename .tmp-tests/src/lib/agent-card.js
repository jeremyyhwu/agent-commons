"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEVEL_DESCRIPTION = exports.AgentCardSchema = exports.ClaimSchema = exports.EvidenceSchema = exports.ClaimStatusSchema = void 0;
exports.isExpired = isExpired;
exports.cardSigningPayload = cardSigningPayload;
exports.assessCard = assessCard;
const zod_1 = require("zod");
/**
 * The signed agent card (formerly "agent passport").
 *
 * A small, self-issued, self-signed JSON card an agent carries into a room.
 *
 * Design rules learned from review:
 *  1. No bare booleans. Every claim is either backed by an evidence object or
 *     explicitly marked `unverified` / `self_reported`. A receiving agent must
 *     be able to *check* a claim, not trust a flag.
 *  2. `owner_policy` describes what THIS agent's owner authorizes THIS agent to
 *     disclose. A counterparty's card is never authorization for us to share
 *     our own data.
 *  3. Expiry / revocation invalidate the *authority* claims (L1–L3). Key
 *     authentication (L0) is shown separately — the key still authenticates
 *     messages even after the card's authority claims lapse.
 *
 * Shape follows A2A Signed Agent Cards (Apache-2.0) and AgentFacts KYA
 * metadata; we take a small subset.
 */
exports.ClaimStatusSchema = zod_1.z.enum(["unverified", "self_reported", "evidence"]);
exports.EvidenceSchema = zod_1.z.object({
    /** Kind of evidence, e.g. "signature" | "domain-challenge" | "probe-result" | "list-check". */
    type: zod_1.z.string(),
    method: zod_1.z.string(),
    /**
     * Who produced it. A label is NOT a trust anchor — `issuer` carries the
     * producer's public key, so a receiver checks a signature against a key
     * rather than trusting a name. Values:
     *  - "self"      the agent itself (authorship only, not independent execution)
     *  - "owner"     the human owner, signing with their own key
     *  - "third-party" an external party with its own key
     */
    produced_by: zod_1.z.enum(["self", "owner", "third-party"]),
    /** Public key of the producer (base64url). Null when no key attests it. */
    issuer: zod_1.z.string().nullable(),
    issued_at: zod_1.z.string(),
    payload: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
    /** Signature over the evidence payload, base64url. */
    evidence_sig: zod_1.z.string(),
});
exports.ClaimSchema = zod_1.z.object({
    status: exports.ClaimStatusSchema,
    evidence: exports.EvidenceSchema.nullable(),
    note: zod_1.z.string().optional(),
});
exports.AgentCardSchema = zod_1.z.object({
    type: zod_1.z.literal("agent_card"),
    v: zod_1.z.literal(1),
    /** Ed25519 public key, base64url — also the agent id. */
    agent_id: zod_1.z.string(),
    display_name: zod_1.z.string(),
    owner: zod_1.z.object({
        name: zod_1.z.string(),
        /** Contact used for the owner-binding challenge; not an identity proof. */
        contact: zod_1.z.string().nullable(),
    }),
    purpose: zod_1.z.array(zod_1.z.string()),
    capabilities: zod_1.z.array(zod_1.z.string()),
    /** THIS agent's own owner-authorized disclosure policy. */
    owner_policy: zod_1.z.object({
        may_disclose: zod_1.z.array(zod_1.z.string()),
        must_not_disclose: zod_1.z.array(zod_1.z.string()),
    }),
    claims: zod_1.z.object({
        /** L0 — the card signature itself proves the sender controls this key. */
        key_control: exports.ClaimSchema,
        /** L1 — owner binding. Proves control of a contact, NOT authority to represent a company. */
        owner_binding: exports.ClaimSchema,
        /** L2 — capability self-test. Self-produced evidence of function. */
        capability_probe: exports.ClaimSchema,
        /** L3 — external screening. A local/synthetic check, not an independent authority. */
        screening: exports.ClaimSchema,
    }),
    expires_at: zod_1.z.string().nullable(),
    revocation: zod_1.z.object({
        revoked: zod_1.z.boolean(),
        reason: zod_1.z.string().nullable(),
        at: zod_1.z.string().nullable(),
    }),
    sig: zod_1.z.string(),
});
exports.LEVEL_DESCRIPTION = {
    L0: "Key control — the card signature verifies. Proves this key, nothing more.",
    L1: "Owner binding — the owner's own key signs a challenge bound to this agent key. Proves control of that key; not a legal identity, not authority to represent an organisation.",
    L2: "Capability probe — self-reported. The signature proves authorship of the result, not independent execution.",
    L3: "External screening — self-reported in this demo; no independent authority is involved.",
};
function isExpired(card, now = new Date()) {
    if (!card.expires_at)
        return false;
    return new Date(card.expires_at).getTime() < now.getTime();
}
/** The bytes that get signed: the card without its `sig` field. */
function cardSigningPayload(card) {
    const { sig: _sig } = card, rest = __rest(card, ["sig"]);
    return rest;
}
/**
 * Assess a card honestly.
 *
 * `keyAuthenticated` must be computed by the caller from the card signature
 * (see `verifyValue` in keys.ts). Expiry/revocation clear the *authority*
 * claims but never the key authentication.
 */
function assessCard(card, keyAuthenticated, now = new Date()) {
    const lapsed = isExpired(card, now) || card.revocation.revoked;
    const has = (c) => !lapsed && c.status === "evidence";
    const level = has(card.claims.screening)
        ? "L3"
        : has(card.claims.capability_probe)
            ? "L2"
            : has(card.claims.owner_binding)
                ? "L1"
                : "L0";
    const label = (c) => {
        var _a, _b;
        if (lapsed && c.status !== "unverified")
            return "lapsed (expired/revoked)";
        switch (c.status) {
            case "evidence":
                return `evidence (${(_b = (_a = c.evidence) === null || _a === void 0 ? void 0 : _a.type) !== null && _b !== void 0 ? _b : "unknown"})`;
            case "self_reported":
                return "self-reported";
            default:
                return "unverified";
        }
    };
    return {
        level,
        keyAuthenticated,
        lapsed,
        claims: [
            {
                key: "key_control",
                level: "L0",
                status: keyAuthenticated ? "evidence" : "unverified",
                label: keyAuthenticated ? "key authenticated" : "key NOT authenticated",
            },
            {
                key: "owner_binding",
                level: "L1",
                status: lapsed ? "unverified" : card.claims.owner_binding.status,
                label: label(card.claims.owner_binding),
            },
            {
                key: "capability_probe",
                level: "L2",
                status: lapsed ? "unverified" : card.claims.capability_probe.status,
                label: label(card.claims.capability_probe),
            },
            {
                key: "screening",
                level: "L3",
                status: lapsed ? "unverified" : card.claims.screening.status,
                label: label(card.claims.screening),
            },
        ],
    };
}

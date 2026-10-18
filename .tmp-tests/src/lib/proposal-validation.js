"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProposalRejectedError = void 0;
exports.hashMatches = hashMatches;
exports.verifyProposalSignature = verifyProposalSignature;
exports.verifyResultCardSignature = verifyResultCardSignature;
exports.recomputeNegotiationState = recomputeNegotiationState;
const canonical_1 = require("./canonical");
const keys_1 = require("./keys");
const browser_crypto_1 = require("./browser-crypto");
class ProposalRejectedError extends Error {
    constructor(message, step) {
        super(message);
        this.step = step;
        this.name = "ProposalRejectedError";
    }
}
exports.ProposalRejectedError = ProposalRejectedError;
/**
 * Check 2 — Hash.
 *
 * `sha256(canonical(terms))` must equal the `termsHash` the record carries.
 * A hash that does not match its own terms is the one failure no reader could
 * detect later.
 */
function hashMatches(terms, termsHashValue) {
    return (0, canonical_1.termsHash)(terms) === termsHashValue;
}
/**
 * Check 3 — Proposal signature.
 *
 * Each entry in `signatures[]` signs the proposal's `termsHash` bound to the
 * signing party. The signer's public key is IN the record — the signature must
 * verify against it, so a party cannot borrow another party's name.
 *
 * Signing payload: `{ termsHash, party }` — the same shape that
 * `firestore-service.createNegotiationWithInitialProposal` and
 * `addProposalCounteroffer` produce via `signUniversalValue`.
 */
function verifyProposalSignature(termsHashValue, partyOrgId, publicKey, sig) {
    if (!sig || !publicKey)
        return false;
    return (0, browser_crypto_1.verifyUniversalSignature)({ termsHash: termsHashValue, party: partyOrgId }, sig, publicKey);
}
/**
 * Check 3b — Result-card issuer signature.
 *
 * For the outcome-layer ResultCard path: the issuer's signature must verify
 * against the issuer key named in `author`, over the card without its `sig`.
 * This is the same payload `negotiation.ts` and `seed.ts` sign.
 */
function verifyResultCardSignature(card) {
    if (!card.sig)
        return false;
    return (0, keys_1.verifyValue)((0, keys_1.withoutSignature)(card), card.sig, card.author);
}
/**
 * Derive the negotiation `state` from the proposals on record under the
 * negotiation's `acceptanceRule`.
 *
 * This is the core invariant from user-data-guide §5: `state` is **derived,
 * not written**. The application never asserts `agreed` — it recomputes it
 * from the signatures on the proposals and the rule stored in the record.
 *
 * Rules:
 *  - **unanimous**: every `requiredParties` org must have signed a proposal
 *    sharing one `termsHash`.
 *  - **quorum**: at least `minAgreed` distinct required parties must have
 *    signed one `termsHash`.
 *  - **explicit**: every listed `requiredParties` must have signed one
 *    `termsHash` (same check as unanimous, but the rule names the parties
 *    explicitly rather than relying on the participant list).
 *
 * Returns the recomputed `state`, the `termsHash` it was derived from, and the
 * set of orgs that have signed that hash.
 */
function recomputeNegotiationState(proposals, rule) {
    var _a;
    if (proposals.length === 0) {
        return { state: "negotiating", stateHash: "", signedParties: [] };
    }
    // Group signatures by termsHash across ALL proposals. A terms hash is
    // "satisfied" when enough required parties have signed it.
    const signaturesByHash = new Map();
    for (const p of proposals) {
        if (!signaturesByHash.has(p.termsHash))
            signaturesByHash.set(p.termsHash, new Set());
        const set = signaturesByHash.get(p.termsHash);
        for (const sig of p.signatures) {
            set.add(sig.partyOrgId);
        }
    }
    const requiredParties = rule.requiredParties;
    const satisfiedHashes = [];
    for (const [hash, signedSet] of signaturesByHash) {
        const signedRequired = requiredParties.filter((org) => signedSet.has(org));
        let satisfied = false;
        if (rule.kind === "unanimous" || rule.kind === "explicit") {
            satisfied =
                requiredParties.length > 0 && signedRequired.length === requiredParties.length;
        }
        else if (rule.kind === "quorum") {
            satisfied = signedRequired.length >= (rule.minAgreed || 2);
        }
        if (satisfied)
            satisfiedHashes.push(hash);
    }
    if (satisfiedHashes.length > 0) {
        const bestHash = satisfiedHashes[0];
        const signedParties = Array.from((_a = signaturesByHash.get(bestHash)) !== null && _a !== void 0 ? _a : []).sort();
        return { state: "agreed", stateHash: bestHash, signedParties };
    }
    // No hash satisfied the rule. Inspect the latest proposal:
    const latest = proposals[proposals.length - 1];
    const latestSigned = new Set(latest.signatures.map((s) => s.partyOrgId));
    const signedRequiredLatest = requiredParties.filter((org) => latestSigned.has(org));
    const distinctSigners = new Set(proposals.flatMap((p) => p.signatures.map((s) => s.partyOrgId)));
    if (distinctSigners.size >= 2 && signedRequiredLatest.length > 0) {
        // Two+ parties signed, but not enough to satisfy the rule.
        return {
            state: "partial",
            stateHash: latest.termsHash,
            signedParties: Array.from(distinctSigners).sort(),
        };
    }
    // Latest proposal is terminal without enough signatures → impasse.
    if (latest.status === "expired" ||
        latest.status === "withdrawn" ||
        latest.status === "rejected") {
        return { state: "impasse", stateHash: latest.termsHash, signedParties: [] };
    }
    // Nothing signed yet → back-and-forth.
    return {
        state: "negotiating",
        stateHash: latest.termsHash,
        signedParties: [],
    };
}

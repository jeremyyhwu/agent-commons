import { termsHash } from "./canonical";
import { verifyValue, withoutSignature } from "./keys";
import { verifyUniversalSignature } from "./browser-crypto";
import type { ResultCard } from "./result-card";
import type {
  AcceptanceRule,
  ProposalRecord,
  SignatureRecord,
} from "./firestore-service";

/**
 * What a third party can check, with no account and no trust in this deployment.
 *
 * The user-data-guide §4 defines three gates a proposal (or result card) must
 * pass before it is allowed to exist. This module is that check, factored out
 * so the Firestore-backed proposal path and the outcome-layer result-card path
 * share one definition of "valid."
 *
 * A refused record is refused — never stored with a warning.
 */

export type RejectStep = "schema" | "hash" | "signature";

export class ProposalRejectedError extends Error {
  constructor(
    message: string,
    readonly step: RejectStep,
  ) {
    super(message);
    this.name = "ProposalRejectedError";
  }
}

/**
 * Check 2 — Hash.
 *
 * `sha256(canonical(terms))` must equal the `termsHash` the record carries.
 * A hash that does not match its own terms is the one failure no reader could
 * detect later.
 */
export function hashMatches(terms: Record<string, unknown>, termsHashValue: string): boolean {
  return termsHash(terms) === termsHashValue;
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
export function verifyProposalSignature(
  termsHashValue: string,
  partyOrgId: string,
  publicKey: string,
  sig: string,
): boolean {
  if (!sig || !publicKey) return false;
  return verifyUniversalSignature(
    { termsHash: termsHashValue, party: partyOrgId },
    sig,
    publicKey,
  );
}

/**
 * Check 3b — Result-card issuer signature.
 *
 * For the outcome-layer ResultCard path: the issuer's signature must verify
 * against the issuer key named in `author`, over the card without its `sig`.
 * This is the same payload `negotiation.ts` and `seed.ts` sign.
 */
export function verifyResultCardSignature(card: ResultCard): boolean {
  if (!card.sig) return false;
  return verifyValue(withoutSignature(card), card.sig, card.author);
}

/* -------------------------------------------------------------------------- */
/* Derived state                                                               */
/* -------------------------------------------------------------------------- */

export type NegotiationState =
  | "negotiating"
  | "agreed"
  | "partial"
  | "impasse"
  | "no-match";

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
export function recomputeNegotiationState(
  proposals: ProposalRecord[],
  rule: AcceptanceRule,
): { state: NegotiationState; stateHash: string; signedParties: string[] } {
  if (proposals.length === 0) {
    return { state: "negotiating", stateHash: "", signedParties: [] };
  }

  // Group signatures by termsHash across ALL proposals. A terms hash is
  // "satisfied" when enough required parties have signed it.
  const signaturesByHash = new Map<string, Set<string>>();
  for (const p of proposals) {
    if (!signaturesByHash.has(p.termsHash)) signaturesByHash.set(p.termsHash, new Set());
    const set = signaturesByHash.get(p.termsHash)!;
    for (const sig of p.signatures) {
      set.add(sig.partyOrgId);
    }
  }

  const requiredParties = rule.requiredParties;
  const satisfiedHashes: string[] = [];

  for (const [hash, signedSet] of signaturesByHash) {
    const signedRequired = requiredParties.filter((org) => signedSet.has(org));
    let satisfied = false;

    if (rule.kind === "unanimous" || rule.kind === "explicit") {
      satisfied =
        requiredParties.length > 0 && signedRequired.length === requiredParties.length;
    } else if (rule.kind === "quorum") {
      satisfied = signedRequired.length >= (rule.minAgreed || 2);
    }

    if (satisfied) satisfiedHashes.push(hash);
  }

  if (satisfiedHashes.length > 0) {
    const bestHash = satisfiedHashes[0];
    const signedParties = Array.from(signaturesByHash.get(bestHash) ?? []).sort();
    return { state: "agreed", stateHash: bestHash, signedParties };
  }

  // No hash satisfied the rule. Inspect the latest proposal:
  const latest = proposals[proposals.length - 1];
  const latestSigned = new Set(latest.signatures.map((s) => s.partyOrgId));
  const signedRequiredLatest = requiredParties.filter((org) => latestSigned.has(org));
  const distinctSigners = new Set(
    proposals.flatMap((p) => p.signatures.map((s) => s.partyOrgId)),
  );

  if (distinctSigners.size >= 2 && signedRequiredLatest.length > 0) {
    // Two+ parties signed, but not enough to satisfy the rule.
    return {
      state: "partial",
      stateHash: latest.termsHash,
      signedParties: Array.from(distinctSigners).sort(),
    };
  }

  // Latest proposal is terminal without enough signatures → impasse.
  if (
    latest.status === "expired" ||
    latest.status === "withdrawn" ||
    latest.status === "rejected"
  ) {
    return { state: "impasse", stateHash: latest.termsHash, signedParties: [] };
  }

  // Nothing signed yet → back-and-forth.
  return {
    state: "negotiating",
    stateHash: latest.termsHash,
    signedParties: [],
  };
}

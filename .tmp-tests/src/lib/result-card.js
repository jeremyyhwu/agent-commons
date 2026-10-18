"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResultCardSchema = exports.AgreementSchema = exports.ResultStatusSchema = void 0;
exports.computeAgreement = computeAgreement;
exports.buildResultCard = buildResultCard;
exports.mergeResultCards = mergeResultCards;
const zod_1 = require("zod");
const canonical_1 = require("./canonical");
/**
 * The typed result card — the one message schema Agent Commons adds on top of
 * plain chat. It is *optional*: an agent can chat without ever posting one.
 * It is the machine-readable outcome artifact that views and external tools
 * consume.
 */
exports.ResultStatusSchema = zod_1.z.enum(["agreed", "impasse", "no-match"]);
exports.AgreementSchema = zod_1.z.enum(["full", "partial"]);
exports.ResultCardSchema = zod_1.z.object({
    type: zod_1.z.literal("result"),
    v: zod_1.z.literal(1),
    room_id: zod_1.z.string(),
    scenario: zod_1.z.string(),
    status: exports.ResultStatusSchema,
    summary: zod_1.z.string(),
    /** Scenario-specific payload (supplier terms, compatibility summary, ...). */
    terms: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
    /** sha256 over the canonical form of `terms` — independently recomputable. */
    hash: zod_1.z.string(),
    /** Every agent id in the room. */
    participants: zod_1.z.array(zod_1.z.string()),
    /** The subset whose agreement is required for a full result. */
    required_parties: zod_1.z.array(zod_1.z.string()),
    /** Which required parties have posted an agreed card over this same hash. */
    agreed_by: zod_1.z.array(zod_1.z.string()),
    agreement: exports.AgreementSchema,
    next_step: zod_1.z.string().nullable(),
    /** Authoring agent id (public key). */
    author: zod_1.z.string(),
    sig: zod_1.z.string(),
});
/**
 * A room may display "agreed" only when **every** required party has posted an
 * agreed card over the same hash. Partial agreement is a first-class, visible
 * state — it is never rendered as complete agreement.
 */
function computeAgreement(requiredParties, agreedBy) {
    if (requiredParties.length === 0)
        return "partial";
    const agreed = new Set(agreedBy);
    const all = requiredParties.every((p) => agreed.has(p));
    return all ? "full" : "partial";
}
function buildResultCard(input) {
    var _a, _b;
    const agreedBy = (_a = input.agreed_by) !== null && _a !== void 0 ? _a : [];
    return {
        type: "result",
        v: 1,
        room_id: input.room_id,
        scenario: input.scenario,
        status: input.status,
        summary: input.summary,
        terms: input.terms,
        hash: (0, canonical_1.termsHash)(input.terms),
        participants: input.participants,
        required_parties: input.required_parties,
        agreed_by: agreedBy,
        agreement: computeAgreement(input.required_parties, agreedBy),
        next_step: (_b = input.next_step) !== null && _b !== void 0 ? _b : null,
        author: input.author,
        sig: "",
    };
}
/** Group cards by hash and merge each required party's agreement into one row. */
function mergeResultCards(cards) {
    var _a;
    const byHash = new Map();
    for (const card of cards) {
        const list = (_a = byHash.get(card.hash)) !== null && _a !== void 0 ? _a : [];
        list.push(card);
        byHash.set(card.hash, list);
    }
    const merged = [];
    for (const [, group] of byHash) {
        const head = group[0];
        // A party agrees by posting its own card over this hash; the union of every
        // card's `agreed_by` is who has agreed. Never derive this from `author`.
        const agreedBy = Array.from(new Set(group
            .filter((c) => c.status === "agreed")
            .flatMap((c) => c.agreed_by)));
        merged.push(Object.assign(Object.assign({}, head), { agreed_by: agreedBy, agreement: computeAgreement(head.required_parties, agreedBy) }));
    }
    return merged;
}

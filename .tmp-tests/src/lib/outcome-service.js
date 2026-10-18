"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostResultCardArgsSchema = exports.ResultCardRejectedError = void 0;
exports.listRooms = listRooms;
exports.readResultCards = readResultCards;
exports.verifyTerms = verifyTerms;
exports.postResultCard = postResultCard;
const zod_1 = require("zod");
const result_card_1 = require("./result-card");
const canonical_1 = require("./canonical");
const keys_1 = require("./keys");
const ingest_transport_1 = require("./ingest-transport");
class ResultCardRejectedError extends Error {
    constructor(message, step) {
        super(message);
        this.step = step;
        this.name = "ResultCardRejectedError";
    }
}
exports.ResultCardRejectedError = ResultCardRejectedError;
/**
 * Read the board. Rooms exist because a result card was posted into them, so
 * this includes rooms that only exist in the ingest layer.
 */
async function listRooms() {
    return (0, ingest_transport_1.listRoomsWithPosted)();
}
/** Every result card in one room, exactly as stored — not merged. */
async function readResultCards(roomId) {
    return (0, ingest_transport_1.getIngestTransport)().listResultCards(roomId);
}
/**
 * Recompute the hash of a terms object on its own, and say which cards on the
 * board already carry it.
 *
 * This is the claim the product makes: a hash needs no trust in us. Give it the
 * same terms and it returns the same `sha256:` string the card carries, so a
 * caller can check the two without asking anyone. The matching cards are the
 * useful half for a caller holding terms it did not compute itself.
 */
async function verifyTerms(terms) {
    const hash = (0, canonical_1.termsHash)(terms);
    const ingest = (0, ingest_transport_1.getIngestTransport)();
    const posted = await ingest.listPostedCards();
    const rooms = await listRooms();
    const cards = [...posted];
    for (const room of rooms) {
        cards.push(...(await ingest.listResultCards(room.room_id)));
    }
    const seen = new Set();
    const matches = [];
    for (const card of cards) {
        if (card.hash !== hash)
            continue;
        const key = `${card.room_id}${card.author}${card.hash}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        matches.push({ room_id: card.room_id, author: card.author, hash: card.hash });
    }
    return { hash, matches };
}
/**
 * Accept a result card, or refuse it and say which gate refused it.
 *
 * Three gates, in order, all of which must pass:
 *   1. schema    — the frozen ResultCardSchema. A card that does not parse is
 *                  not a card.
 *   2. hash      — `termsHash(card.terms)` must equal `card.hash`. This is the
 *                  frozen canonical form, so it is the same bytes any other
 *                  party computes. A hash that does not match its own terms is
 *                  the one failure no reader could detect later.
 *   3. signature — the issuer's signature must verify against the issuer's own
 *                  key, over the card minus its `sig` field (the same payload
 *                  `negotiation.ts` signs).
 *
 * Authentication is per record, not per session: the signature *is* the
 * credential, checked against the public key on the card itself. That is why
 * there is no login here — and why a judge is never asked to sign in to look at
 * a board that is public anyway.
 *
 * A refused card is refused, not stored with a warning.
 */
async function postResultCard(input) {
    const candidate = typeof input === "object" && input !== null && "card" in input
        ? input.card
        : input;
    // 1. Schema.
    const parsed = result_card_1.ResultCardSchema.safeParse(candidate);
    if (!parsed.success) {
        const detail = parsed.error.issues
            .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
            .join("; ");
        throw new ResultCardRejectedError(`card does not match the result card schema — ${detail}`, "schema");
    }
    const card = parsed.data;
    // 2. Hash: the card's own terms must hash to the hash it carries.
    const recomputed = (0, canonical_1.termsHash)(card.terms);
    if (recomputed !== card.hash) {
        throw new ResultCardRejectedError(`terms hash does not match the card — card claims ${card.hash}, terms recompute to ${recomputed}`, "hash");
    }
    // 3. Issuer signature, over the card without its `sig`.
    if (!(0, keys_1.verifyValue)((0, keys_1.withoutSignature)(card), card.sig, card.author)) {
        throw new ResultCardRejectedError(`issuer signature does not verify against the issuer key on the card (${card.author})`, "signature");
    }
    const stored = await (0, ingest_transport_1.getIngestTransport)().putResultCard(card.room_id, card);
    return { card: stored, room_id: card.room_id, issuer: card.author };
}
/** Input schema for the write path: a card is posted as one opaque object. */
exports.PostResultCardArgsSchema = zod_1.z.object({
    card: zod_1.z
        .record(zod_1.z.string(), zod_1.z.unknown())
        .describe("The result card: type='result', v=1, room_id, scenario, status, summary, " +
        "terms, hash, participants, required_parties, agreed_by, agreement, " +
        "next_step, author and sig. hash must be sha256 over the canonical form " +
        "of terms, and sig must be the issuer's signature over the card without sig."),
});

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const seed_1 = require("../src/lib/seed");
const result_card_1 = require("../src/lib/result-card");
const human_signoff_1 = require("../src/lib/human-signoff");
/**
 * Unit tests for the human terminal step — the point where a person, not an
 * agent, closes a negotiation. Run with: npm test
 *
 * These use the real seed cards (real hashes, real `next_step` values), not
 * fixtures, so they fail if the seeded story stops exercising this path.
 */
/**
 * The room's card, merged the way the product merges it. A room can hold more
 * than one card — where two sides agreed, each posted its own — and it is the
 * merged row the pages and the sign-off step actually operate on.
 */
function card(roomId) {
    const cards = seed_1.SEED_CARDS.filter((c) => c.room_id === roomId);
    const [merged] = (0, result_card_1.mergeResultCards)(cards);
    if (!merged)
        throw new Error(`seed card missing for ${roomId}`);
    return merged;
}
(0, node_test_1.default)("a result card that stops at awaiting_signature is where the human enters", () => {
    strict_1.default.equal((0, human_signoff_1.isAwaitingSignature)(card("room-northwind")), true);
    strict_1.default.equal((0, human_signoff_1.isAwaitingSignature)(card("room-orion")), false);
});
(0, node_test_1.default)("a sign-off is bound to the room and to the exact terms hash it confirms", () => {
    const northwind = card("room-northwind");
    const off = (0, human_signoff_1.buildSignOff)({
        card: northwind,
        displayName: "Jem",
        at: "2026-10-16T09:00:00.000Z",
    });
    strict_1.default.equal(off.room_id, "room-northwind");
    strict_1.default.equal(off.hash, northwind.hash);
    strict_1.default.equal(off.display_name, "Jem");
    strict_1.default.equal(off.signed_off_at, "2026-10-16T09:00:00.000Z");
});
(0, node_test_1.default)("a confirmation records the moment it was made", () => {
    const northwind = card("room-northwind");
    const off = (0, human_signoff_1.buildSignOff)({ card: northwind });
    const at = Date.parse(off.signed_off_at);
    const now = Date.now();
    strict_1.default.ok(Number.isFinite(at), `not an ISO instant: ${off.signed_off_at}`);
    strict_1.default.ok(at <= now + 1000 && at >= now - 60000, `stamped ${off.signed_off_at}, now ${new Date(now).toISOString()}`);
});
(0, node_test_1.default)("a card that never stopped at awaiting_signature cannot be signed off", () => {
    // An impasse has nothing to confirm...
    strict_1.default.throws(() => (0, human_signoff_1.buildSignOff)({ card: card("room-orion") }), human_signoff_1.SignOffRejectedError);
    // ...and a multi-party room still held by `awaiting_confirmation` is a
    // different step: the agents are not done yet.
    strict_1.default.throws(() => (0, human_signoff_1.buildSignOff)({ card: card("room-weekend") }), human_signoff_1.SignOffRejectedError);
});
(0, node_test_1.default)("the stage a card shows is decided by whether a human has closed it", () => {
    const northwind = card("room-northwind");
    strict_1.default.equal((0, human_signoff_1.cardStage)(northwind, []), "awaiting_signature");
    strict_1.default.equal((0, human_signoff_1.canConfirm)(northwind, []), true);
    const off = (0, human_signoff_1.buildSignOff)({
        card: northwind,
        displayName: "Jem",
        at: "2026-10-16T09:00:00.000Z",
    });
    strict_1.default.equal((0, human_signoff_1.cardStage)(northwind, [off]), "signed_off");
    strict_1.default.equal((0, human_signoff_1.canConfirm)(northwind, [off]), false);
});
(0, node_test_1.default)("a sign-off does not carry over to a renegotiated card under a new hash", () => {
    const northwind = card("room-northwind");
    const off = (0, human_signoff_1.buildSignOff)({
        card: northwind,
        displayName: "Jem",
        at: "2026-10-16T09:00:00.000Z",
    });
    const renegotiated = Object.assign(Object.assign({}, northwind), { hash: "sha256:different-terms" });
    strict_1.default.equal((0, human_signoff_1.cardStage)(renegotiated, [off]), "awaiting_signature");
    strict_1.default.equal((0, human_signoff_1.canConfirm)(renegotiated, [off]), true);
});
(0, node_test_1.default)("the same card cannot be confirmed twice", () => {
    const northwind = card("room-northwind");
    const first = (0, human_signoff_1.buildSignOff)({ card: northwind, displayName: "Jem" });
    strict_1.default.throws(() => (0, human_signoff_1.buildSignOff)({ card: northwind, displayName: "Someone else" }, [first]), human_signoff_1.SignOffRejectedError);
});
(0, node_test_1.default)("a board row closes only on a sign-off that matches the room's current hash", () => {
    var _a;
    const northwind = card("room-northwind");
    const off = (0, human_signoff_1.buildSignOff)({
        card: northwind,
        displayName: "Jem",
        at: "2026-10-16T09:00:00.000Z",
    });
    strict_1.default.equal((_a = (0, human_signoff_1.signOffFor)([off], "room-northwind", northwind.hash)) === null || _a === void 0 ? void 0 : _a.display_name, "Jem");
    strict_1.default.equal((0, human_signoff_1.signOffFor)([off], "room-northwind", "sha256:other"), undefined);
    strict_1.default.equal((0, human_signoff_1.signOffFor)([off], "room-delta", northwind.hash), undefined);
});
(0, node_test_1.default)("a confirmation with no usable name is attributed to the demo signer", () => {
    const northwind = card("room-northwind");
    strict_1.default.equal((0, human_signoff_1.buildSignOff)({ card: northwind }).display_name, "demo-human");
    strict_1.default.equal((0, human_signoff_1.buildSignOff)({ card: northwind, displayName: "   " }).display_name, "demo-human");
    strict_1.default.equal((0, human_signoff_1.buildSignOff)({ card: northwind, displayName: " Jem " }).display_name, "Jem");
});

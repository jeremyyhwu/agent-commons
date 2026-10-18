"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const result_card_1 = require("../src/lib/result-card");
const keys_1 = require("../src/lib/keys");
const ingest_transport_1 = require("../src/lib/ingest-transport");
/**
 * The write layer an external agent reaches, and the room list the board reads.
 * Run with: npm test
 *
 * Worth pinning, because the room list is *derived* from posted cards and that
 * derivation had a bug: posted cards were merged across every room before the
 * rooms were grouped, so two rooms that agreed over the same terms hash
 * collapsed into a single row. The second room stayed readable through
 * `read_result_cards` but never appeared on the board — the one thing the board
 * is for. Merging belongs inside a room, and these tests hold it there.
 */
/** One terms object, so two rooms can genuinely share a hash. */
const TERMS = { spec: "A-100", quantity: 5000, unit_price: 4.05, lead_time_days: 21 };
const PARTIES = ["Buyer.demo", "Seller.demo"];
/** A card as an external issuer would post it: its own key, the room's parties. */
function signedCard(roomId, agreedBy) {
    const keys = (0, keys_1.generateAgentKeyPair)();
    const unsigned = (0, result_card_1.buildResultCard)({
        room_id: roomId,
        scenario: "commercial-terms",
        status: "agreed",
        summary: "All commercial terms inside both parties' bounds.",
        terms: TERMS,
        participants: PARTIES,
        required_parties: PARTIES,
        agreed_by: agreedBy,
        next_step: "awaiting_signature",
        author: keys.publicKeyRaw,
    });
    return Object.assign(Object.assign({}, unsigned), { sig: (0, keys_1.signValue)((0, keys_1.withoutSignature)(unsigned), keys.privateKey) });
}
(0, node_test_1.default)("two rooms over the same terms hash both stay on the board", async () => {
    const ingest = (0, ingest_transport_1.getIngestTransport)();
    const first = signedCard("room-shared-terms-a", [PARTIES[0]]);
    const second = signedCard("room-shared-terms-b", [PARTIES[0]]);
    strict_1.default.equal(first.hash, second.hash, "the two cards must share a hash for this test to mean anything");
    await ingest.putResultCard(first.room_id, first);
    await ingest.putResultCard(second.room_id, second);
    const ids = (await (0, ingest_transport_1.listRoomsWithPosted)()).map((room) => room.room_id);
    strict_1.default.ok(ids.includes("room-shared-terms-a"), `first room missing from ${ids.join(", ")}`);
    strict_1.default.ok(ids.includes("room-shared-terms-b"), `second room missing from ${ids.join(", ")}`);
});
(0, node_test_1.default)("two issuers over one hash roll their own room up to agreed", async () => {
    const ingest = (0, ingest_transport_1.getIngestTransport)();
    await ingest.putResultCard("room-rollup", signedCard("room-rollup", [PARTIES[0]]));
    await ingest.putResultCard("room-rollup", signedCard("room-rollup", [PARTIES[1]]));
    const room = (await (0, ingest_transport_1.listRoomsWithPosted)()).find((r) => r.room_id === "room-rollup");
    strict_1.default.ok(room, "the posted room must be listed");
    strict_1.default.equal(room.status, "agreed");
    strict_1.default.equal(room.agreed_parties, 2);
    strict_1.default.equal(room.required_parties, 2);
});
(0, node_test_1.default)("one issuer alone leaves the room partial, never agreed", async () => {
    const ingest = (0, ingest_transport_1.getIngestTransport)();
    await ingest.putResultCard("room-partial", signedCard("room-partial", [PARTIES[0]]));
    const room = (await (0, ingest_transport_1.listRoomsWithPosted)()).find((r) => r.room_id === "room-partial");
    strict_1.default.ok(room, "the posted room must be listed");
    strict_1.default.equal(room.status, "partial");
    strict_1.default.equal(room.agreed_parties, 1);
});
(0, node_test_1.default)("re-posting the same card replaces its row instead of adding one", async () => {
    const ingest = (0, ingest_transport_1.getIngestTransport)();
    const card = signedCard("room-idempotent", [PARTIES[0]]);
    await ingest.putResultCard(card.room_id, card);
    await ingest.putResultCard(card.room_id, card);
    const mine = (await ingest.listResultCards(card.room_id)).filter((c) => c.author === card.author && c.hash === card.hash);
    strict_1.default.equal(mine.length, 1);
});
(0, node_test_1.default)("a card whose room_id disagrees with the room it is posted to is refused", async () => {
    const ingest = (0, ingest_transport_1.getIngestTransport)();
    const card = signedCard("room-elsewhere", [PARTIES[0]]);
    await strict_1.default.rejects(() => ingest.putResultCard("room-wrong", card), /does not match the room/);
});

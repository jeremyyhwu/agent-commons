"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const seed_1 = require("../src/lib/seed");
const result_card_1 = require("../src/lib/result-card");
const card_signature_1 = require("../src/lib/card-signature");
const agent_card_demo_1 = require("../src/lib/agent-card-demo");
/**
 * The seeded board has to hold up to the two claims the product makes about it:
 * every card is signed by the issuer it names, and no card speaks for a party
 * that did not post it. Run with: npm test
 */
const inRoom = (roomId) => seed_1.SEED_CARDS.filter((c) => c.room_id === roomId);
(0, node_test_1.default)("every seeded card carries a signature that verifies against the key it names", () => {
    strict_1.default.ok(seed_1.SEED_CARDS.length >= 7, "the board should have a real story on it");
    for (const card of seed_1.SEED_CARDS) {
        strict_1.default.equal((0, card_signature_1.cardSignatureVerdict)(card), "verifies", `${card.room_id}: the card signed by ${card.author.slice(0, 12)}… does not verify`);
    }
});
(0, node_test_1.default)("a tampered card fails the same check", () => {
    const [card] = seed_1.SEED_CARDS;
    const tampered = Object.assign(Object.assign({}, card), { terms: Object.assign(Object.assign({}, card.terms), { unit_price: 0.01 }) });
    strict_1.default.equal((0, card_signature_1.cardSignatureVerdict)(tampered), "invalid");
    strict_1.default.equal((0, card_signature_1.cardSignatureVerdict)(Object.assign(Object.assign({}, card), { sig: "" })), "unsigned");
});
(0, node_test_1.default)("a card's author is the key its own agent card carries", () => {
    const supplier = (0, agent_card_demo_1.supplierCard)("room-northwind");
    const label = (0, agent_card_demo_1.supplierLabel)("room-northwind");
    const posted = inRoom("room-northwind").find((c) => c.agreed_by.includes(label));
    strict_1.default.ok(posted, "the supplier posted a card claiming its own agreement");
    strict_1.default.equal(posted.author, supplier.agent_id);
    const buyer = (0, agent_card_demo_1.demoBuyerCard)();
    const buyerCard = seed_1.SEED_CARDS.find((c) => c.author === buyer.agent_id);
    strict_1.default.ok(buyerCard, "the buyer's own key appears as an author on the board");
});
(0, node_test_1.default)("no single card claims agreement on another party's behalf", () => {
    for (const card of seed_1.SEED_CARDS) {
        strict_1.default.ok(card.agreed_by.length <= 1, `${card.room_id}: one card claims ${card.agreed_by.length} parties — a card may speak only for its author`);
    }
});
(0, node_test_1.default)("the agreed room reads full only because both sides posted", () => {
    const raw = inRoom("room-northwind");
    strict_1.default.equal(raw.length, 2);
    strict_1.default.equal(new Set(raw.map((c) => c.author)).size, 2, "two issuers, two keys");
    const [merged] = (0, result_card_1.mergeResultCards)(raw);
    strict_1.default.equal(merged.agreement, "full");
    strict_1.default.equal(merged.agreed_by.length, 2);
});
(0, node_test_1.default)("the multi-party room reads partial 2/3 because two of three posted", () => {
    const raw = inRoom("room-weekend");
    strict_1.default.equal(raw.length, 2);
    strict_1.default.equal(new Set(raw.map((c) => c.author)).size, 2);
    const [merged] = (0, result_card_1.mergeResultCards)(raw);
    strict_1.default.equal(merged.status, "agreed");
    strict_1.default.equal(merged.agreement, "partial");
    strict_1.default.equal(merged.agreed_by.length, 2);
    strict_1.default.equal(merged.required_parties.length, 3);
});

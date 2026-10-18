"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cardsForRoom = cardsForRoom;
exports.trustOf = trustOf;
exports.buyerTrust = buyerTrust;
exports.counterpartyTrust = counterpartyTrust;
exports.buyerProfile = buyerProfile;
const agent_card_1 = require("./agent-card");
const agent_card_demo_1 = require("./agent-card-demo");
const trust_badges_1 = require("./trust-badges");
/**
 * Seeded agent cards and their trust badges (server only — card signatures are
 * checked with node:crypto).
 *
 * Every counterparty in the procurement story shares a card, so a badge is
 * shown for each one rather than a "profile not shared" placeholder. Two of
 * them are deliberately imperfect and say so: Northwind's authority claims have
 * lapsed, and Shell Co's screening check matched. A room outside that story —
 * the multi-party picnic — has no counterparty profile to show.
 */
/** Agent cards presented in a room, buyer first — the same set the room page shows. */
function cardsForRoom(roomId) {
    if (agent_card_demo_1.SUPPLIER_ROOMS.includes(roomId))
        return [(0, agent_card_demo_1.demoBuyerCard)(), (0, agent_card_demo_1.supplierCard)(roomId)];
    return [(0, agent_card_demo_1.demoBuyerCard)()];
}
function trustOf(card) {
    var _a;
    const assessment = (0, agent_card_1.assessCard)(card, (0, agent_card_demo_1.verifyCard)(card));
    const flagged = ((_a = card.claims.screening.evidence) === null || _a === void 0 ? void 0 : _a.payload.matched) === true;
    return {
        name: card.display_name,
        company: card.owner.name,
        badges: (0, trust_badges_1.trustBadges)(assessment, { flagged }),
        lapsed: assessment.lapsed,
    };
}
/** Your own agent, as seeded. */
function buyerTrust() {
    return trustOf((0, agent_card_demo_1.demoBuyerCard)());
}
/** The counterparty's card in a room, or null when it shared none. */
function counterpartyTrust(roomId) {
    const [, other] = cardsForRoom(roomId);
    return other ? trustOf(other) : null;
}
/** What the person's own seeded agent is set up with — the editable parts of its card. */
function buyerProfile() {
    const card = (0, agent_card_demo_1.demoBuyerCard)();
    return {
        contact: card.owner.contact,
        capabilities: card.capabilities,
        policy: { may: card.owner_policy.may_disclose, never: card.owner_policy.must_not_disclose },
    };
}

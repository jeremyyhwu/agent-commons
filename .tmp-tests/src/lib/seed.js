"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SEED_CARDS = void 0;
exports.recomputeHash = recomputeHash;
const result_card_1 = require("./result-card");
const canonical_1 = require("./canonical");
const keys_1 = require("./keys");
const agent_card_demo_1 = require("./agent-card-demo");
/** An issuer that signs with its own seeded private key, held in agent-card-demo. */
const issuerOf = (agentId) => ({
    agent_id: agentId,
    sign: (value) => (0, agent_card_demo_1.signAsAgent)(agentId, value),
});
const BUYER_ISSUER = issuerOf(agent_card_demo_1.BUYER_AGENT_ID);
const NORTHWIND_ISSUER = issuerOf((0, agent_card_demo_1.supplierAgentId)("room-northwind"));
const DELTA_ISSUER = issuerOf((0, agent_card_demo_1.supplierAgentId)("room-delta"));
const ORION_ISSUER = issuerOf((0, agent_card_demo_1.supplierAgentId)("room-orion"));
const VEGA_ISSUER = issuerOf((0, agent_card_demo_1.supplierAgentId)("room-vega"));
const SHELL_ISSUER = issuerOf((0, agent_card_demo_1.supplierAgentId)("room-shell"));
/* ------------------------------------------------------------------ *
 * Roster labels — knowable in advance, unlike a key minted at run time
 * ------------------------------------------------------------------ */
const BUYER = agent_card_demo_1.BUYER_LABEL;
const NORTHWIND = (0, agent_card_demo_1.supplierLabel)("room-northwind");
const DELTA = (0, agent_card_demo_1.supplierLabel)("room-delta");
const ORION = (0, agent_card_demo_1.supplierLabel)("room-orion");
const VEGA = (0, agent_card_demo_1.supplierLabel)("room-vega");
const SHELL = (0, agent_card_demo_1.supplierLabel)("room-shell");
/** Build a card and sign it with its issuer's key — the way a real issuer does. */
function post(input) {
    const unsigned = (0, result_card_1.buildResultCard)({
        room_id: input.room_id,
        scenario: "commercial-terms",
        status: input.status,
        summary: input.summary,
        terms: input.terms,
        participants: input.participants,
        required_parties: input.required_parties,
        agreed_by: input.agreed_by,
        next_step: input.next_step,
        author: input.issuer.agent_id,
    });
    return Object.assign(Object.assign({}, unsigned), { sig: input.issuer.sign((0, keys_1.withoutSignature)(unsigned)) });
}
/* ------------------------------------------------------------------ *
 * One sourcing round for a mid-size homeware retailer, ahead of a spring
 * launch. Five suppliers, five different outcomes, real figures.
 * ------------------------------------------------------------------ */
/** Northwind: the deal that is waiting for the human. */
const NORTHWIND_TERMS = {
    spec: "HBR-VAC-750",
    quantity: 12000,
    unit_price: 3.85,
    incoterms: "FOB Haiphong",
    payment_terms: "30% deposit, 70% on B/L",
    lead_time_days: 45,
};
exports.SEED_CARDS = [
    /* ---- room-northwind: two cards, one hash ----------------------------
     * The supplier posted, the buyer posted, and the room reads `agreed`
     * because the product unions what the two of them signed. The
     * counterparty's agent card has expired, which is why the overview warns
     * before offering the confirm button.
     */
    post({
        room_id: "room-northwind",
        status: "agreed",
        summary: "Insulated flask HBR-VAC-750 agreed at $3.85/unit, 45-day lead, FOB Haiphong.",
        terms: NORTHWIND_TERMS,
        participants: [BUYER, NORTHWIND],
        required_parties: [BUYER, NORTHWIND],
        agreed_by: [NORTHWIND],
        next_step: "awaiting_signature",
        issuer: NORTHWIND_ISSUER,
    }),
    post({
        room_id: "room-northwind",
        status: "agreed",
        summary: "Buyer accepts HBR-VAC-750 x12,000 at $3.85/unit, 45-day lead, FOB Haiphong.",
        terms: NORTHWIND_TERMS,
        participants: [BUYER, NORTHWIND],
        required_parties: [BUYER, NORTHWIND],
        agreed_by: [BUYER],
        next_step: "awaiting_signature",
        issuer: BUYER_ISSUER,
    }),
    /* ---- room-delta: the supplier is in, the buyer is not yet ----------- */
    post({
        room_id: "room-delta",
        status: "agreed",
        summary: "Supplier accepts HBR-KNF-8IN at $6.20/unit; the buyer has not countersigned.",
        terms: {
            spec: "HBR-KNF-8IN",
            quantity: 4000,
            unit_price: 6.2,
            incoterms: "FOB Gdansk",
            payment_terms: "Net 45",
            lead_time_days: 35,
        },
        participants: [BUYER, DELTA],
        required_parties: [BUYER, DELTA],
        agreed_by: [DELTA],
        next_step: "awaiting_signature",
        issuer: DELTA_ISSUER,
    }),
    /* ---- room-orion: a clean impasse on price --------------------------- */
    post({
        room_id: "room-orion",
        status: "impasse",
        summary: "Seller floor $3.40 exceeds buyer ceiling $2.95 on HBR-GLS-6PC; no overlap.",
        terms: {
            spec: "HBR-GLS-6PC",
            quantity: 6000,
            unit_price: 2.95,
            incoterms: "FOB Izmir",
            payment_terms: "30% deposit, 70% on B/L",
            lead_time_days: 40,
        },
        participants: [BUYER, ORION],
        required_parties: [BUYER, ORION],
        agreed_by: [],
        next_step: null,
        issuer: ORION_ISSUER,
    }),
    /* ---- room-vega: an impasse where price is not the blocker ----------- */
    post({
        room_id: "room-vega",
        status: "impasse",
        summary: "75-day lead on HBR-CUT-24PC misses the launch window; price is not the blocker.",
        terms: {
            spec: "HBR-CUT-24PC",
            quantity: 2500,
            unit_price: 8.75,
            incoterms: "FOB Chennai",
            payment_terms: "Net 30",
            lead_time_days: 75,
        },
        participants: [BUYER, VEGA],
        required_parties: [BUYER, VEGA],
        agreed_by: [],
        next_step: null,
        issuer: VEGA_ISSUER,
    }),
    /* ---- room-shell: stopped by screening before any offer --------------
     * No price was ever agreed, so this room contributes no order value to the
     * funnel — the honest reading of a room that never reached terms.
     */
    post({
        room_id: "room-shell",
        status: "no-match",
        summary: "Counterparty flagged by the screening check before negotiation; the room is held.",
        terms: { spec: "HBR-MUG-350", quantity: 15000 },
        participants: [BUYER, SHELL],
        required_parties: [BUYER, SHELL],
        agreed_by: [],
        next_step: null,
        issuer: SHELL_ISSUER,
    }),
    ...friendsGathering(),
];
/**
 * room-weekend — three friends, two of them in.
 *
 * Not commerce, and deliberately so: the same product carries a multi-party
 * room. Two cards, two issuers, one hash, so it reads partial 2/3 because two
 * of three posted — not because one friend wrote down another's vote.
 */
function friendsGathering() {
    const ALEX = "Alex-Agent.demo";
    const BO = "Bo-Agent.demo";
    const CY = "Cy-Agent.demo";
    const terms = { date: "2026-11-08", location: "Riverside Park", activity: "picnic" };
    const posters = [
        [ALEX, (0, agent_card_demo_1.mintIssuer)(), "Alex is in for Saturday afternoon at the lake."],
        [BO, (0, agent_card_demo_1.mintIssuer)(), "Bo is in for Saturday afternoon at the lake."],
    ];
    return posters.map(([label, issuer, summary]) => {
        const unsigned = (0, result_card_1.buildResultCard)({
            room_id: "room-weekend",
            scenario: "friends-gathering",
            status: "agreed",
            summary,
            terms,
            participants: [ALEX, BO, CY],
            required_parties: [ALEX, BO, CY],
            agreed_by: [label],
            next_step: "awaiting_confirmation",
            author: issuer.agent_id,
        });
        return Object.assign(Object.assign({}, unsigned), { sig: issuer.sign((0, keys_1.withoutSignature)(unsigned)) });
    });
}
/** Recompute a card's hash from its terms — the independent-verification path. */
function recomputeHash(card) {
    return (0, canonical_1.termsHash)(card.terms);
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUPPLIER_ROOMS = exports.BUYER_LABEL = exports.BUYER_AGENT_ID = void 0;
exports.supplierAgentId = supplierAgentId;
exports.signAsAgent = signAsAgent;
exports.mintIssuer = mintIssuer;
exports.demoBuyerCard = demoBuyerCard;
exports.supplierCard = supplierCard;
exports.supplierLabel = supplierLabel;
exports.demoFlaggedCard = demoFlaggedCard;
exports.demoExpiredCard = demoExpiredCard;
exports.verifyCard = verifyCard;
exports.verifyEvidence = verifyEvidence;
const keys_1 = require("./keys");
const agent_card_1 = require("./agent-card");
/* ------------------------------------------------------------------ *
 * The buyer — one owner, one agent, present in every room
 * ------------------------------------------------------------------ */
const buyerKeys = (0, keys_1.generateAgentKeyPair)();
const buyerOwnerKeys = (0, keys_1.generateAgentKeyPair)();
/** The buyer agent's public key. Also the `author` of every card it posts. */
exports.BUYER_AGENT_ID = buyerKeys.publicKeyRaw;
/** The roster label both sides know before either has posted anything. */
exports.BUYER_LABEL = "Harbourline-Sourcing-Agent.demo";
const SUPPLIERS = [
    {
        room_id: "room-northwind",
        label: "Northwind-Supply-Agent.demo",
        display_name: "Northwind Supply Agent",
        owner: { name: "Northwind Supply Co.", contact: "sales@northwind-supply.example" },
        capabilities: ["negotiate-price", "verify-spec"],
        policy: {
            may_disclose: ["spec", "quantity", "unit_price", "lead_time_days"],
            must_not_disclose: ["cost-basis", "capacity-headroom"],
        },
        // Already expired: the authority claims lapse, the key still authenticates.
        expires_at: "2026-10-01T00:00:00Z",
        screening: { matched: false },
        owner_binding: true,
    },
    {
        room_id: "room-delta",
        label: "Delta-Parts-Agent.demo",
        display_name: "Delta Parts Agent",
        owner: { name: "Delta Parts Ltd.", contact: "trade@delta-parts.example" },
        capabilities: ["negotiate-price", "verify-spec", "capacity-check"],
        policy: {
            may_disclose: ["spec", "quantity", "unit_price", "lead_time_days", "incoterms"],
            must_not_disclose: ["cost-basis", "tooling-cost"],
        },
        expires_at: "2026-12-31T00:00:00Z",
        screening: { matched: false },
        owner_binding: true,
    },
    {
        room_id: "room-orion",
        label: "Orion-Components-Agent.demo",
        display_name: "Orion Components Agent",
        owner: { name: "Orion Components A.S.", contact: "sales@orion-components.example" },
        capabilities: ["negotiate-price", "verify-spec"],
        policy: {
            may_disclose: ["spec", "quantity", "unit_price"],
            must_not_disclose: ["cost-basis", "minimum-margin"],
        },
        expires_at: "2026-12-31T00:00:00Z",
        screening: { matched: false },
        owner_binding: true,
    },
    {
        room_id: "room-vega",
        label: "Vega-Metals-Agent.demo",
        display_name: "Vega Metals Agent",
        owner: { name: "Vega Metals Pvt. Ltd.", contact: "export@vega-metals.example" },
        capabilities: ["negotiate-price", "capacity-check"],
        policy: {
            may_disclose: ["spec", "quantity", "lead_time_days"],
            must_not_disclose: ["cost-basis", "capacity-headroom"],
        },
        expires_at: "2026-11-15T00:00:00Z",
        screening: { matched: false },
        owner_binding: true,
    },
    {
        room_id: "room-shell",
        label: "Shell-Co-Agent.demo",
        display_name: "Shell Co Agent",
        owner: { name: "Shell Co Trading", contact: "ops@shell-co.example" },
        capabilities: ["negotiate-price"],
        policy: { may_disclose: ["spec", "quantity"], must_not_disclose: [] },
        expires_at: null,
        screening: {
            matched: true,
            reason: "synthetic flag: registered entity dissolved in the demo dataset",
        },
        owner_binding: false,
    },
];
/** Rooms whose counterparty has a seeded agent card. */
exports.SUPPLIER_ROOMS = SUPPLIERS.map((s) => s.room_id);
/** One key pair per supplier, minted once per process and never written to disk.
 * The agent key signs result cards; the owner key signs the owner binding, so a
 * receiver can check that the owner's key — not the agent's — vouches for it.
 */
const SUPPLIER_KEYS = new Map(SUPPLIERS.map((s) => [s.room_id, { agent: (0, keys_1.generateAgentKeyPair)(), owner: (0, keys_1.generateAgentKeyPair)() }]));
function keysFor(roomId) {
    const found = SUPPLIER_KEYS.get(roomId);
    if (!found)
        throw new Error(`no seeded supplier agent for ${roomId}`);
    return found;
}
/** The counterparty agent's public key in a room — the `author` of its cards. */
function supplierAgentId(roomId) {
    return keysFor(roomId).agent.publicKeyRaw;
}
/**
 * Sign a value with a seeded agent's own private key.
 *
 * The private keys stay in this module; `seed.ts` posts result cards by asking
 * for a signature rather than by holding a key. That mirrors the outside world,
 * where an issuer signs and the layer only ever receives the signed artefact.
 */
function signAsAgent(agentId, value) {
    var _a;
    const keys = agentId === exports.BUYER_AGENT_ID ? buyerKeys : (_a = [...SUPPLIER_KEYS.values()].find((k) => k.agent.publicKeyRaw === agentId)) === null || _a === void 0 ? void 0 : _a.agent;
    if (!keys)
        throw new Error(`no seeded private key for agent ${agentId.slice(0, 12)}…`);
    return (0, keys_1.signValue)(value, keys.privateKey);
}
/**
 * A standalone issuer with no agent card of its own.
 *
 * Used for seeded counterparties that are not part of the procurement story —
 * the multi-party room's three friends. They still post genuinely signed cards,
 * so no card on the board is a card nobody signed.
 */
function mintIssuer() {
    const keys = (0, keys_1.generateAgentKeyPair)();
    return { agent_id: keys.publicKeyRaw, sign: (value) => (0, keys_1.signValue)(value, keys.privateKey) };
}
/* ------------------------------------------------------------------ *
 * Card construction
 * ------------------------------------------------------------------ */
function evidence(producer, type, method, produced_by, payload) {
    return {
        type,
        method,
        produced_by,
        issuer: producer.publicKeyRaw,
        issued_at: new Date().toISOString(),
        payload,
        evidence_sig: (0, keys_1.signValue)(payload, producer.privateKey),
    };
}
function claim(status, ev, note) {
    return Object.assign({ status, evidence: ev }, (note ? { note } : {}));
}
function finalize(card, keys) {
    return Object.assign(Object.assign({}, card), { sig: (0, keys_1.signValue)(card, keys.privateKey) });
}
/** The three claims every seeded agent makes, with the evidence it actually has. */
function claimsFor(seed, keys, agentId) {
    return {
        key_control: claim("evidence", evidence(keys.agent, "signature", "ed25519-over-card", "self", { agent_id: agentId }), "The card signature itself — verifiable by anyone."),
        owner_binding: seed.owner_binding
            ? claim("evidence", evidence(keys.owner, "domain-challenge", "owner-key-signs-challenge", "owner", {
                agent_id: agentId,
                nonce: seed.room_id.replace(/^room-/, ""),
                contact: seed.owner.contact,
                scope: "key-control-only",
            }), "Proves the owner's key controls this agent key. Not a legal identity, not company authority.")
            : // Nothing claimed that cannot be shown.
                claim("unverified", null, "No owner-binding evidence supplied."),
        capability_probe: claim("self_reported", evidence(keys.agent, "probe-result", "probe.constraint-check.v1", "self", {
            agent_id: agentId,
            probe: "constraint-check",
            result: "pass",
        }), seed.screening.matched
            ? "Self-reported, and the screening result below contradicts the claim."
            : "Self-reported. Proves authorship of the result, not independent execution."),
        screening: claim("self_reported", evidence(keys.agent, "list-check", "local-list-check-v1", "self", Object.assign({ agent_id: agentId, list: "synthetic-demo-list-v1", list_version: "2026-10-13", matched: seed.screening.matched }, (seed.screening.reason ? { match_reason: seed.screening.reason } : {}))), seed.screening.matched
            ? "Self-reported list match — the room holds negotiation until a human clears it."
            : "Self-reported. A local list check — no independent authority is involved."),
    };
}
/** A well-formed buyer agent. */
function demoBuyerCard() {
    const agentId = buyerKeys.publicKeyRaw;
    return finalize({
        type: "agent_card",
        v: 1,
        agent_id: agentId,
        display_name: "Harbourline Sourcing Agent",
        owner: { name: "Harbourline Retail Group", contact: "sourcing@harbourline.example" },
        purpose: ["commercial-terms"],
        capabilities: ["negotiate-price", "verify-spec", "constraint-check"],
        owner_policy: {
            may_disclose: ["spec", "quantity", "target-price-range", "delivery-window"],
            must_not_disclose: ["walk-away-price", "internal-cost-basis"],
        },
        claims: {
            key_control: claim("evidence", evidence(buyerKeys, "signature", "ed25519-over-card", "self", { agent_id: agentId }), "The card signature itself — verifiable by anyone."),
            // Signed by the OWNER's key, and bound to this agent's key.
            owner_binding: claim("evidence", evidence(buyerOwnerKeys, "domain-challenge", "owner-key-signs-challenge", "owner", {
                agent_id: agentId,
                nonce: "a7f3c1e0",
                contact: "sourcing@harbourline.example",
                scope: "key-control-only",
            }), "Proves the owner's key controls this agent key. Not a legal identity, not company authority."),
            // Self-reported: our signature proves we authored this result.
            capability_probe: claim("self_reported", evidence(buyerKeys, "probe-result", "probe.constraint-check.v1", "self", {
                agent_id: agentId,
                probe: "constraint-check",
                result: "pass",
            }), "Self-reported. Proves authorship of the result, not independent execution."),
            screening: claim("self_reported", evidence(buyerKeys, "list-check", "local-list-check-v1", "self", {
                agent_id: agentId,
                list: "synthetic-demo-list-v1",
                list_version: "2026-10-13",
                matched: false,
            }), "Self-reported. A local list check — no independent authority is involved."),
        },
        expires_at: "2026-11-30T00:00:00Z",
        revocation: { revoked: false, reason: null, at: null },
    }, buyerKeys);
}
/** The counterparty agent's card in one room. Every seeded room has one. */
function supplierCard(roomId) {
    const seed = SUPPLIERS.find((s) => s.room_id === roomId);
    if (!seed)
        throw new Error(`no seeded supplier agent for ${roomId}`);
    const keys = keysFor(roomId);
    const agentId = keys.agent.publicKeyRaw;
    return finalize({
        type: "agent_card",
        v: 1,
        agent_id: agentId,
        display_name: seed.display_name,
        owner: seed.owner,
        purpose: ["commercial-terms"],
        capabilities: seed.capabilities,
        owner_policy: seed.policy,
        claims: claimsFor(seed, keys, agentId),
        expires_at: seed.expires_at,
        revocation: { revoked: false, reason: null, at: null },
    }, keys.agent);
}
/** The roster label a room's counterparty uses in result cards. */
function supplierLabel(roomId) {
    const seed = SUPPLIERS.find((s) => s.room_id === roomId);
    if (!seed)
        throw new Error(`no seeded supplier agent for ${roomId}`);
    return seed.label;
}
/* ------------------------------------------------------------------ *
 * Named aliases the rest of the app reads
 * ------------------------------------------------------------------ */
/** A counterparty whose self-reported screening result trips the synthetic list. */
function demoFlaggedCard() {
    return supplierCard("room-shell");
}
/** A card whose authority claims have lapsed but whose key still authenticates. */
function demoExpiredCard() {
    return supplierCard("room-northwind");
}
/** Re-check the card signature — key authentication (L0), independent of claims. */
function verifyCard(card) {
    return (0, keys_1.verifyValue)((0, agent_card_1.cardSigningPayload)(card), card.sig, card.agent_id);
}
/**
 * Re-check an evidence object against its stated issuer key.
 * Note: this validates authorship. It does NOT establish independent execution.
 */
function verifyEvidence(ev) {
    if (!ev.issuer)
        return false;
    return (0, keys_1.verifyValue)(ev.payload, ev.evidence_sig, ev.issuer);
}

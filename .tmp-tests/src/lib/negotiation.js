"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runNegotiation = runNegotiation;
exports.negotiateToResultCard = negotiateToResultCard;
const result_card_1 = require("./result-card");
const CONCESSION = 0.35;
function emitFields(party, base, price) {
    const fields = Object.assign(Object.assign({}, base), { unit_price: Number(price.toFixed(2)) });
    const leaked = [];
    for (const key of Object.keys(fields)) {
        if (party.policy.must_not_disclose.includes(key)) {
            delete fields[key];
            leaked.push(key);
        }
    }
    return fields;
}
/** Check which (if any) forbidden fields a party tried to put on the wire. */
function checkLeak(party, fields) {
    return Object.keys(fields).filter((k) => party.policy.must_not_disclose.includes(k));
}
function runNegotiation(input) {
    var _a, _b;
    const { buyer, seller } = input;
    const maxRounds = (_a = input.maxRounds) !== null && _a !== void 0 ? _a : 6;
    const base = (_b = input.baseFields) !== null && _b !== void 0 ? _b : {};
    let b = Number((buyer.reservation * 0.85).toFixed(2));
    let s = Number((seller.reservation * 1.25).toFixed(2));
    const rounds = [];
    const leaked = [];
    for (let round = 1; round <= maxRounds; round += 1) {
        const buyerFields = emitFields(buyer, base, b);
        const sellerFields = emitFields(seller, base, s);
        leaked.push(...checkLeak(buyer, buyerFields), ...checkLeak(seller, sellerFields));
        rounds.push({ round, from: buyer.id, role: "buyer", price: b, fields: buyerFields });
        rounds.push({ round, from: seller.id, role: "seller", price: s, fields: sellerFields });
        if (b >= s) {
            const price = Number(((b + s) / 2).toFixed(2));
            return { status: "agreed", rounds, price, leaked, gap: null };
        }
        b = Number((b + (buyer.reservation - b) * CONCESSION).toFixed(2));
        s = Number((s - (s - seller.reservation) * CONCESSION).toFixed(2));
    }
    return {
        status: "impasse",
        rounds,
        price: null,
        leaked,
        gap: `buyer ceiling ${buyer.reservation} below seller floor ${seller.reservation}`,
    };
}
/**
 * Run a negotiation and turn the outcome into a signed result card.
 *
 * One card, not two. This path runs **both** sides inside our own engine — the
 * buyer and the seller here are two roles we simulate, not two independent
 * owners — so a single signature over the joint outcome is the honest artefact.
 * The board's rooms are the opposite case: they stand for separate owners, so
 * each side posts its own card (see `seed.ts`).
 */
function negotiateToResultCard(input, sign) {
    var _a;
    const outcome = runNegotiation({
        buyer: input.buyer,
        seller: input.seller,
        maxRounds: input.maxRounds,
        baseFields: input.baseFields,
    });
    const participants = [input.buyer.id, input.seller.id];
    const required = [...participants];
    const terms = outcome.status === "agreed"
        ? Object.assign(Object.assign({}, input.baseFields), { unit_price: outcome.price }) : Object.assign(Object.assign({}, input.baseFields), { gap: outcome.gap });
    const card = (0, result_card_1.buildResultCard)({
        room_id: input.room_id,
        scenario: input.scenario,
        status: outcome.status,
        summary: outcome.status === "agreed"
            ? `Converged at ${outcome.price} after ${outcome.rounds.length / 2} rounds.`
            : `Impasse: ${outcome.gap}.`,
        terms,
        participants,
        required_parties: required,
        agreed_by: outcome.status === "agreed" ? required : [],
        next_step: outcome.status === "agreed" ? "awaiting_signature" : null,
        author: (_a = input.author) !== null && _a !== void 0 ? _a : input.seller.id,
    });
    // Sign over the card without its `sig` field.
    const { sig: _sig } = card, payload = __rest(card, ["sig"]);
    return { card: Object.assign(Object.assign({}, card), { sig: sign(payload) }), outcome };
}

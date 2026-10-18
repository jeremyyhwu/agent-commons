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
exports.runMultiPartyNegotiation = runMultiPartyNegotiation;
const result_card_1 = require("./result-card");
const FIELDS = ["date", "location", "activity"];
function intersect(values) {
    if (values.length === 0)
        return [];
    return values.reduce((acc, cur) => acc.filter((v) => cur.includes(v)));
}
function runMultiPartyNegotiation(input) {
    const { parties, room_id, scenario, sign } = input;
    const common = {};
    const blocked_by = [];
    for (const field of FIELDS) {
        const commonValues = intersect(parties.map((p) => p.acceptable[field]));
        common[field] = commonValues;
        if (commonValues.length === 0)
            blocked_by.push(field);
    }
    const participants = parties.map((p) => p.id);
    const required = [...participants];
    if (blocked_by.length > 0) {
        const card = (0, result_card_1.buildResultCard)({
            room_id,
            scenario,
            status: "no-match",
            summary: `No common value for: ${blocked_by.join(", ")}.`,
            terms: Object.fromEntries(blocked_by.map((f) => [f, "no-common-value"])),
            participants,
            required_parties: required,
            agreed_by: [],
            next_step: null,
            author: parties[0].id,
        });
        const { sig: _s } = card, payload = __rest(card, ["sig"]);
        return { status: "no-match", terms: null, blocked_by, cards: [Object.assign(Object.assign({}, card), { sig: sign(payload) })] };
    }
    const terms = {
        date: common.date[0],
        location: common.location[0],
        activity: common.activity[0],
    };
    // Emit one card per party, in order — agreement climbs partial → full.
    const cards = [];
    const agreedBy = [];
    for (const party of parties) {
        agreedBy.push(party.id);
        const card = (0, result_card_1.buildResultCard)({
            room_id,
            scenario,
            status: "agreed",
            summary: `Agreed: ${terms.activity} on ${terms.date} at ${terms.location}.`,
            terms,
            participants,
            required_parties: required,
            agreed_by: [...agreedBy],
            next_step: "awaiting_confirmation",
            author: party.id,
        });
        const { sig: _s } = card, payload = __rest(card, ["sig"]);
        cards.push(Object.assign(Object.assign({}, card), { sig: sign(payload) }));
    }
    return { status: "agreed", terms, blocked_by: [], cards };
}

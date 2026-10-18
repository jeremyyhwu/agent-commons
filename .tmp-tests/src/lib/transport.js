"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DemoTransport = void 0;
exports.roomStatusFromCards = roomStatusFromCards;
const result_card_1 = require("./result-card");
const seed_1 = require("./seed");
/** Roll per-hash agreement into the room-level status the board shows. */
function roomStatusFromCards(cards) {
    var _a;
    if (cards.length === 0) {
        return { status: "negotiating", required: 0, agreed: 0 };
    }
    const merged = (0, result_card_1.mergeResultCards)(cards);
    // Prefer a fully-agreed result, then a partial one, then impasse / no-match.
    const full = merged.find((c) => c.status === "agreed" && c.agreement === "full");
    if (full) {
        return {
            status: "agreed",
            hash: full.hash,
            required: full.required_parties.length,
            agreed: full.agreed_by.length,
        };
    }
    const partial = merged.find((c) => c.status === "agreed");
    if (partial) {
        return {
            status: "partial",
            hash: partial.hash,
            required: partial.required_parties.length,
            agreed: partial.agreed_by.length,
        };
    }
    const impasse = merged.find((c) => c.status === "impasse");
    if (impasse) {
        return { status: "impasse", hash: impasse.hash, required: impasse.required_parties.length, agreed: 0 };
    }
    const noMatch = merged.find((c) => c.status === "no-match");
    return { status: "no-match", hash: noMatch === null || noMatch === void 0 ? void 0 : noMatch.hash, required: (_a = noMatch === null || noMatch === void 0 ? void 0 : noMatch.required_parties.length) !== null && _a !== void 0 ? _a : 0, agreed: 0 };
}
class DemoTransport {
    constructor() {
        this.cards = [...seed_1.SEED_CARDS];
    }
    async listResultCards(roomId) {
        return this.cards.filter((c) => c.room_id === roomId);
    }
    async listRooms() {
        var _a;
        const byRoom = new Map();
        for (const card of this.cards) {
            const list = (_a = byRoom.get(card.room_id)) !== null && _a !== void 0 ? _a : [];
            list.push(card);
            byRoom.set(card.room_id, list);
        }
        return Array.from(byRoom.entries()).map(([roomId, cards]) => {
            const head = cards[0];
            const rolled = roomStatusFromCards(cards);
            return {
                room_id: roomId,
                scenario: head.scenario,
                scenario_label: head.scenario,
                participants: head.participants,
                status: rolled.status,
                summary: head.summary,
                hash: rolled.hash,
                required_parties: rolled.required,
                agreed_parties: rolled.agreed,
                updated_at: new Date().toISOString(),
            };
        });
    }
    async send(_roomId, _body) {
        // Demo transport keeps no message log — the board is outcomes-only.
    }
}
exports.DemoTransport = DemoTransport;
/**
 * Which transport a page gets is decided in `./transport-factory` (env switch),
 * not here — this file stays the boundary definition plus the demo behaviour
 * that every other view falls back to.
 */

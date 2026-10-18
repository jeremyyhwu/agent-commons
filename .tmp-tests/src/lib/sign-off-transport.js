"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.roomStage = roomStage;
exports.withSignOffs = withSignOffs;
exports.getSignOffTransport = getSignOffTransport;
const result_card_1 = require("./result-card");
const transport_1 = require("./transport");
// The transport a view gets is decided in one place (env switch), so the
// sign-off wrapper wraps whatever that place selected rather than assuming the
// demo transport.
const transport_factory_1 = require("./transport-factory");
const firestore_transport_1 = require("./firestore-transport");
const human_signoff_1 = require("./human-signoff");
/**
 * Where the confirmation history lives.
 *
 * Next compiles each server route into its own module instance, so an array
 * held by this file would give the route that records a confirmation one copy
 * and the page that displays it another — the board would never catch up. The
 * transport is a process-level resource, so its state is parked where the whole
 * process can see it. `tests/sign-off-transport.test.ts` pins this: it loads two
 * separate copies of this module and requires them to agree.
 */
const SIGN_OFFS = Symbol.for("agent-commons.sign-offs");
function signOffHistory() {
    var _a;
    const globals = globalThis;
    (_a = globals[SIGN_OFFS]) !== null && _a !== void 0 ? _a : (globals[SIGN_OFFS] = []);
    return globals[SIGN_OFFS];
}
class SignOffTransportWrapper {
    constructor(inner) {
        this.inner = inner;
    }
    listRooms() {
        return this.inner.listRooms();
    }
    listResultCards(roomId) {
        return this.inner.listResultCards(roomId);
    }
    send(roomId, body) {
        return this.inner.send(roomId, body);
    }
    async listSignOffs() {
        // A copy: the cards and rooms a view holds must not be able to write into
        // the human step's history by accident.
        const local = signOffHistory();
        if (this.inner instanceof firestore_transport_1.FirestoreTransport) {
            try {
                const remote = await this.inner.listSignOffs();
                const seen = new Set(local.map((s) => `${s.room_id}__${s.hash}`));
                for (const r of remote) {
                    if (!seen.has(`${r.room_id}__${r.hash}`)) {
                        local.push(r);
                        seen.add(`${r.room_id}__${r.hash}`);
                    }
                }
            }
            catch (err) {
                console.warn("Firestore sign-offs sync note:", err);
            }
        }
        return [...local];
    }
    async recordSignOff(input) {
        const history = signOffHistory();
        const cards = (0, result_card_1.mergeResultCards)(await this.inner.listResultCards(input.room_id));
        const card = cards.find((c) => c.hash === input.hash);
        if (!card) {
            throw new human_signoff_1.SignOffRejectedError(`no result card with this hash is on the board in ${input.room_id}`);
        }
        const signOff = (0, human_signoff_1.buildSignOff)({ card, displayName: input.display_name }, history);
        history.push(signOff);
        if (this.inner instanceof firestore_transport_1.FirestoreTransport) {
            try {
                await this.inner.putSignOff(signOff);
            }
            catch (err) {
                console.warn("Firestore sign-off save note:", err);
            }
        }
        return signOff;
    }
}
/**
 * The human stage of a room, the way the board shows it: roll the room's cards
 * up exactly as the transport does, then read that card's stage. A room with no
 * human step to close reports no stage.
 */
function roomStage(cards, signOffs) {
    const rolled = (0, transport_1.roomStatusFromCards)(cards);
    if (!rolled.hash)
        return null;
    const head = (0, result_card_1.mergeResultCards)(cards).find((c) => c.hash === rolled.hash);
    return head ? (0, human_signoff_1.cardStage)(head, signOffs) : null;
}
function withSignOffs(inner) {
    return new SignOffTransportWrapper(inner);
}
let singleton = null;
/** The one sign-off-aware transport the views share. */
function getSignOffTransport() {
    if (!singleton)
        singleton = withSignOffs((0, transport_factory_1.getTransport)());
    return singleton;
}

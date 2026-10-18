"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withIngest = withIngest;
exports.getIngestTransport = getIngestTransport;
exports.listRoomsWithPosted = listRoomsWithPosted;
const transport_1 = require("./transport");
// Which transport the write lands in is decided in one place (env switch), so
// this wraps whatever that place selected rather than assuming the demo one.
const transport_factory_1 = require("./transport-factory");
const firestore_transport_1 = require("./firestore-transport");
/**
 * Process-wide, for the same reason as the sign-off history: one board, one
 * process, several module instances. `tests/ingest-transport.test.ts` pins this.
 */
const POSTED = Symbol.for("agent-commons.posted-cards");
function postedCards() {
    var _a;
    const globals = globalThis;
    (_a = globals[POSTED]) !== null && _a !== void 0 ? _a : (globals[POSTED] = []);
    return globals[POSTED];
}
/**
 * A deterministic key per (author, hash), mirroring the Firestore document id:
 * re-posting the same card over the same terms is the same record, not a second
 * row, and two authors over one hash stay two rows.
 */
function postedKey(card) {
    return `${card.room_id}\u0000${card.author}\u0000${card.hash}`;
}
class IngestTransportWrapper {
    constructor(inner) {
        this.inner = inner;
    }
    listRooms() {
        return this.inner.listRooms();
    }
    /**
     * The inner transport's cards plus anything posted through this layer. In
     * Firestore mode the second list is empty by construction, so this is the
     * plain inner result; in demo mode it is what makes a posted card appear on
     * the board without editing the frozen DemoTransport.
     */
    async listResultCards(roomId) {
        const inner = await this.inner.listResultCards(roomId);
        const posted = await this.listPostedCards(roomId);
        if (posted.length === 0)
            return inner;
        const seen = new Set(inner.map(postedKey));
        return [...inner, ...posted.filter((card) => !seen.has(postedKey(card)))];
    }
    send(roomId, body) {
        return this.inner.send(roomId, body);
    }
    async listPostedCards(roomId) {
        const all = postedCards();
        return roomId === undefined ? [...all] : all.filter((card) => card.room_id === roomId);
    }
    async putResultCard(roomId, card) {
        // A card whose own room_id disagrees with the room it was posted into would
        // be filed under one id and read back under another, so it is refused here.
        if (card.room_id !== roomId) {
            throw new Error(`card room_id ${JSON.stringify(card.room_id)} does not match the room it was posted to (${JSON.stringify(roomId)})`);
        }
        if (this.inner instanceof firestore_transport_1.FirestoreTransport) {
            // Firestore owns the write: the same deterministic card document the rest
            // of this transport writes, so a re-post is idempotent there too.
            await this.inner.putResultCard(roomId, card);
            return card;
        }
        // Demo mode: no store to write to, so the process is the store. Re-posting
        // the same card replaces its row rather than duplicating it.
        const store = postedCards();
        const key = postedKey(card);
        const at = store.findIndex((existing) => postedKey(existing) === key);
        if (at >= 0)
            store[at] = card;
        else
            store.push(card);
        return card;
    }
}
/**
 * A room summary for cards that exist only in the ingest layer, derived the
 * same way the transports derive one — through `roomStatusFromCards`, so a
 * posted room cannot disagree with a seeded room about what "agreed" means.
 */
function summaryFromCards(cards) {
    const head = cards[0];
    const rolled = (0, transport_1.roomStatusFromCards)(cards);
    return {
        room_id: head.room_id,
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
}
/** Wraps any transport with the write capability an external agent needs. */
function withIngest(inner) {
    return new IngestTransportWrapper(inner);
}
let singleton = null;
/** The one ingest-aware transport the views and the MCP gate share. */
function getIngestTransport() {
    if (!singleton)
        singleton = withIngest((0, transport_factory_1.getTransport)());
    return singleton;
}
/**
 * Rooms the board should show: the transport's own rooms, plus any room that
 * exists only because a card was posted into it. A posted card is what makes a
 * room visible, so a room nobody has posted into does not appear.
 */
async function listRoomsWithPosted() {
    var _a;
    const ingest = getIngestTransport();
    const rooms = await ingest.listRooms();
    const posted = await ingest.listPostedCards();
    if (posted.length === 0)
        return rooms;
    // Group by room *before* anything is merged. Merging is per hash, and two
    // different rooms can legitimately agree over the same terms — merging across
    // rooms first collapsed them into a single row, so the second room stayed
    // readable through `read_result_cards` but never reached the board. Each
    // room rolls itself up in `summaryFromCards`, which merges within the room.
    const byRoom = new Map();
    for (const card of posted) {
        byRoom.set(card.room_id, [...((_a = byRoom.get(card.room_id)) !== null && _a !== void 0 ? _a : []), card]);
    }
    const known = new Set(rooms.map((room) => room.room_id));
    for (const [roomId, cards] of byRoom) {
        if (known.has(roomId))
            continue;
        rooms.push(summaryFromCards(cards));
    }
    return rooms;
}

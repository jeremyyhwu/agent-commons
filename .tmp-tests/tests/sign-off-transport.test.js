"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const node_test_2 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const transport_1 = require("../src/lib/transport");
const result_card_1 = require("../src/lib/result-card");
const human_signoff_1 = require("../src/lib/human-signoff");
const seed_1 = require("../src/lib/seed");
const sign_off_transport_1 = require("../src/lib/sign-off-transport");
/**
 * The sign-off state has to live in the transport, not in a component — that is
 * what makes the board, the room page and the next page load agree. These tests
 * run against the real DemoTransport and the real seed cards.
 */
(0, node_test_2.beforeEach)(() => {
    // The history is process-wide on purpose (see sign-off-transport.ts), so each
    // case starts from an empty one. The key is the same `Symbol.for` the module
    // uses; nothing here needs a test-only hook in production code.
    globalThis[Symbol.for("agent-commons.sign-offs")] = [];
});
async function head(store, roomId) {
    const [card] = (0, result_card_1.mergeResultCards)(await store.listResultCards(roomId));
    if (!card)
        throw new Error(`${roomId} has no result card`);
    return card;
}
(0, node_test_1.default)("a confirmation recorded through the transport closes the card for every reader", async () => {
    const store = (0, sign_off_transport_1.withSignOffs)(new transport_1.DemoTransport());
    const card = await head(store, "room-northwind");
    strict_1.default.equal((0, human_signoff_1.cardStage)(card, []), "awaiting_signature");
    await store.recordSignOff({
        room_id: "room-northwind",
        hash: card.hash,
        display_name: "Jem",
    });
    const signOffs = await store.listSignOffs();
    strict_1.default.equal(signOffs.length, 1);
    strict_1.default.equal((0, human_signoff_1.cardStage)(card, signOffs), "signed_off");
});
(0, node_test_1.default)("a confirmation is a separate record, not a rewrite of the agents' card", async () => {
    const inner = new transport_1.DemoTransport();
    const store = (0, sign_off_transport_1.withSignOffs)(inner);
    const card = await head(store, "room-northwind");
    const before = structuredClone(await inner.listResultCards("room-northwind"));
    await store.recordSignOff({
        room_id: "room-northwind",
        hash: card.hash,
        display_name: "Jem",
    });
    // What the agents posted is, field for field, what any later reader gets.
    strict_1.default.deepEqual(await inner.listResultCards("room-northwind"), before);
    const [posted] = (0, result_card_1.mergeResultCards)(await store.listResultCards("room-northwind"));
    strict_1.default.equal(posted === null || posted === void 0 ? void 0 : posted.next_step, "awaiting_signature");
    // The closure is derived from the separate record, never stored on the card.
    strict_1.default.equal((0, human_signoff_1.cardStage)(posted, await store.listSignOffs()), "signed_off");
});
(0, node_test_1.default)("a second reader of the shared transport sees the confirmation", async () => {
    const roomPage = (0, sign_off_transport_1.getSignOffTransport)();
    const card = await head(roomPage, "room-northwind");
    await roomPage.recordSignOff({
        room_id: "room-northwind",
        hash: card.hash,
        display_name: "Jem",
    });
    // The board is a different call site, possibly a later request: same store.
    const board = (0, sign_off_transport_1.getSignOffTransport)();
    const signOffs = await board.listSignOffs();
    strict_1.default.equal((0, human_signoff_1.cardStage)(card, signOffs), "signed_off");
});
(0, node_test_1.default)("separate copies of the module — what each server route gets — share one store", async () => {
    // Next bundles every server route on its own: two module instances of the
    // same file, which is why the API route that records a confirmation and the
    // page that displays it cannot keep the history on a module-level array.
    const modulePath = require.resolve("../src/lib/sign-off-transport");
    const loadFresh = () => {
        delete require.cache[modulePath];
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require(modulePath);
    };
    const apiRoute = loadFresh();
    const page = loadFresh();
    if (apiRoute === page)
        throw new Error("the two loads were not separate copies");
    const card = await head(page.withSignOffs(new transport_1.DemoTransport()), "room-northwind");
    await apiRoute.withSignOffs(new transport_1.DemoTransport()).recordSignOff({
        room_id: "room-northwind",
        hash: card.hash,
        display_name: "Jem",
    });
    strict_1.default.equal((await page.withSignOffs(new transport_1.DemoTransport()).listSignOffs()).length, 1);
});
(0, node_test_1.default)("a board row reports the human stage of the result its room rolled up to", () => {
    const northwind = seed_1.SEED_CARDS.find((c) => c.room_id === "room-northwind");
    const closed = (0, human_signoff_1.buildSignOff)({
        card: northwind,
        displayName: "Jem",
        at: "2026-10-16T09:00:00.000Z",
    });
    strict_1.default.equal((0, sign_off_transport_1.roomStage)([northwind], []), "awaiting_signature");
    strict_1.default.equal((0, sign_off_transport_1.roomStage)([northwind], [closed]), "signed_off");
    // An impasse room never reached the human step, so it has none to show.
    strict_1.default.equal((0, sign_off_transport_1.roomStage)([seed_1.SEED_CARDS.find((c) => c.room_id === "room-orion")], []), null);
});
(0, node_test_1.default)("the transport refuses a hash that is not on the board in that room", async () => {
    const store = (0, sign_off_transport_1.withSignOffs)(new transport_1.DemoTransport());
    await strict_1.default.rejects(() => store.recordSignOff({
        room_id: "room-northwind",
        hash: "sha256:invented",
        display_name: "Jem",
    }), human_signoff_1.SignOffRejectedError);
    strict_1.default.equal((await store.listSignOffs()).length, 0);
});
(0, node_test_1.default)("the transport refuses to close a room that never reached the human step", async () => {
    const store = (0, sign_off_transport_1.withSignOffs)(new transport_1.DemoTransport());
    const impasse = await head(store, "room-orion");
    await strict_1.default.rejects(() => store.recordSignOff({ room_id: "room-orion", hash: impasse.hash }), human_signoff_1.SignOffRejectedError);
    strict_1.default.equal((await store.listSignOffs()).length, 0);
});

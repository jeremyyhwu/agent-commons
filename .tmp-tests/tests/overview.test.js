"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const seed_1 = require("../src/lib/seed");
const transport_1 = require("../src/lib/transport");
const result_card_1 = require("../src/lib/result-card");
const human_signoff_1 = require("../src/lib/human-signoff");
const overview_1 = require("../src/lib/overview");
/**
 * The overview page's derivations, over the real seed story.
 * Run with: npm test
 */
async function seedRooms() {
    const transport = new transport_1.DemoTransport();
    const rooms = await transport.listRooms();
    return Promise.all(rooms.map(async (room) => ({
        room,
        cards: (0, result_card_1.mergeResultCards)(await transport.listResultCards(room.room_id)),
    })));
}
(0, node_test_1.default)("the overview tells the procurement story only, from the buyer's side", async () => {
    const { buyer, suppliers } = (0, overview_1.buildOverview)(await seedRooms(), []);
    strict_1.default.equal(buyer === null || buyer === void 0 ? void 0 : buyer.name, "Harbourline Sourcing");
    strict_1.default.deepEqual(suppliers.map((s) => s.name).sort(), ["Delta Parts", "Northwind Supply", "Orion Components", "Shell Co", "Vega Metals"]);
});
(0, node_test_1.default)("the funnel narrows from contacted to confirmed", async () => {
    const { funnel } = (0, overview_1.buildOverview)(await seedRooms(), []);
    strict_1.default.deepEqual(funnel, {
        contacted: 5,
        passedCheck: 4,
        supplierAccepted: 2,
        bothAgreed: 1,
        confirmed: 0,
    });
});
(0, node_test_1.default)("dropped suppliers are named with the step they dropped at", async () => {
    const { suppliers } = (0, overview_1.buildOverview)(await seedRooms(), []);
    const dropped = Object.fromEntries(suppliers.map((s) => [s.name, s.dropped]));
    strict_1.default.equal(dropped["Shell Co"], "check");
    strict_1.default.equal(dropped["Orion Components"], "no-deal");
    strict_1.default.equal(dropped["Vega Metals"], "no-deal");
    strict_1.default.equal(dropped["Northwind Supply"], null);
});
(0, node_test_1.default)("only a fully agreed deal waits for the human, and leaves once confirmed", async () => {
    var _a;
    const rooms = await seedRooms();
    const before = (0, overview_1.buildOverview)(rooms, []);
    strict_1.default.deepEqual(before.pending.map((p) => p.supplier), ["Northwind Supply"]);
    strict_1.default.equal(before.suppliers[0].status, "Deal agreed · waiting for you");
    const card = (0, result_card_1.mergeResultCards)(seed_1.SEED_CARDS.filter((c) => c.room_id === "room-northwind"))[0];
    const after = (0, overview_1.buildOverview)(rooms, [(0, human_signoff_1.buildSignOff)({ card })]);
    strict_1.default.equal(after.pending.length, 0);
    strict_1.default.equal(after.funnel.confirmed, 1);
    strict_1.default.equal((_a = after.suppliers.find((s) => s.name === "Northwind Supply")) === null || _a === void 0 ? void 0 : _a.status, "Deal closed");
});
(0, node_test_1.default)("names and terms read as a person would say them", () => {
    strict_1.default.equal((0, overview_1.agentName)("Northwind-Supply-Agent.demo"), "Northwind Supply");
    strict_1.default.equal((0, overview_1.agentName)("alex"), "Alex");
    strict_1.default.deepEqual((0, overview_1.readableTerms)({ unit_price: 4.05, lead_time_days: 21, quantity: 5000 }), [
        { label: "Unit price", value: "$4.05" },
        { label: "Delivery", value: "21 days" },
        { label: "Quantity", value: "5,000" },
    ]);
});
(0, node_test_1.default)("each funnel stage carries its order value and pass-through rate", async () => {
    const { suppliers } = (0, overview_1.buildOverview)(await seedRooms(), []);
    const stages = (0, overview_1.funnelStages)(suppliers);
    strict_1.default.deepEqual(stages.map((s) => [s.count, s.value, s.pct]), [
        [5, 110575, null],
        [4, 110575, 80],
        [2, 71000, 50],
        [1, 46200, 50],
        [0, 0, 0],
    ]);
});
(0, node_test_1.default)("a deal's history is built from outcomes and sign-offs, never a transcript", async () => {
    const { suppliers } = (0, overview_1.buildOverview)(await seedRooms(), []);
    const history = (name) => suppliers.find((s) => s.name === name).history.map((h) => h.text);
    strict_1.default.deepEqual(history("Delta Parts"), [
        "Your agent opened talks with Delta Parts",
        "Delta Parts passed the background check",
        "Delta Parts agreed to the terms",
        "Your agent (Harbourline Sourcing) hasn't agreed yet",
    ]);
    strict_1.default.match(history("Shell Co")[1], /Background check flagged Shell Co/);
    strict_1.default.equal(history("Northwind Supply").at(-1), "Waiting for your confirmation");
});

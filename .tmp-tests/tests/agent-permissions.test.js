"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const agent_permissions_1 = require("../src/lib/agent-permissions");
const agent_trust_1 = require("../src/lib/agent-trust");
const agent_card_build_1 = require("../src/lib/agent-card-build");
const agent_card_1 = require("../src/lib/agent-card");
const agent_card_demo_1 = require("../src/lib/agent-card-demo");
const trust_badges_1 = require("../src/lib/trust-badges");
const agent_trust_2 = require("../src/lib/agent-trust");
/** Agent permission switches over the seeded buyer's real policy. Run with: npm test */
(0, node_test_1.default)("the seeded buyer shares specs but keeps its walk-away price private", () => {
    const items = Object.fromEntries((0, agent_permissions_1.permissionItems)((0, agent_trust_1.buyerProfile)().policy).map((i) => [i.key, i.allowed]));
    strict_1.default.equal(items.spec, true);
    strict_1.default.equal(items["walk-away-price"], false);
    strict_1.default.equal(items["budget-ceiling"], false, "unlisted items count as private");
});
(0, node_test_1.default)("a switch moves an item between the two lists, never into both", () => {
    const start = { may: ["spec"], never: ["walk-away-price"] };
    const opened = (0, agent_permissions_1.togglePermission)(start, "walk-away-price");
    strict_1.default.deepEqual(opened, { may: ["spec", "walk-away-price"], never: [] });
    strict_1.default.deepEqual((0, agent_permissions_1.togglePermission)(opened, "walk-away-price"), start);
});
(0, node_test_1.default)("the signed policy writes every switch out explicitly", () => {
    const full = (0, agent_permissions_1.completePolicy)({ may: ["spec"], never: [] });
    strict_1.default.ok(full.never.includes("internal-cost-basis"));
    strict_1.default.equal(full.may.length + full.never.length, (0, agent_permissions_1.permissionItems)(full).length);
});
(0, node_test_1.default)("re-signing the seeded buyer with new permissions keeps the same trust badges", () => {
    var _a;
    const profile = (0, agent_trust_1.buyerProfile)();
    const card = (0, agent_card_build_1.createAgentCard)({
        display_name: "Acme Buyer Agent",
        owner_name: "Acme Corp",
        owner_contact: (_a = profile.contact) !== null && _a !== void 0 ? _a : undefined,
        capabilities: profile.capabilities,
        may_disclose: ["spec"],
        must_not_disclose: ["walk-away-price"],
        levels: { owner_binding: true, capability_probe: true, screening: true },
    });
    const states = (b) => b.map((x) => `${x.key}:${x.state}`);
    strict_1.default.deepEqual(states((0, trust_badges_1.trustBadges)((0, agent_card_1.assessCard)(card, (0, agent_card_demo_1.verifyCard)(card)))), states((0, agent_trust_2.buyerTrust)().badges));
});

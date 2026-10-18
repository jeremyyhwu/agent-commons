"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const agent_trust_1 = require("../src/lib/agent-trust");
const trust_badges_1 = require("../src/lib/trust-badges");
/**
 * Trust badges over the real seeded agent cards. Run with: npm test
 */
const states = (badges) => Object.fromEntries(badges.map((b) => [b.key, b.state]));
(0, node_test_1.default)("your seeded buyer is signed and owner-verified; the rest is only claimed", () => {
    strict_1.default.deepEqual(states((0, agent_trust_1.buyerTrust)().badges), {
        key_control: "verified",
        owner_binding: "verified",
        capability_probe: "claimed",
        screening: "claimed",
    });
});
(0, node_test_1.default)("a flagged counterparty fails its background check", () => {
    const shell = (0, agent_trust_1.counterpartyTrust)("room-shell");
    strict_1.default.ok(shell);
    strict_1.default.equal(states(shell.badges).screening, "failed");
    strict_1.default.equal((0, trust_badges_1.trustSummary)(shell.badges).label, "Don't trust");
});
(0, node_test_1.default)("an expired card keeps its signature but loses every authority check", () => {
    const northwind = (0, agent_trust_1.counterpartyTrust)("room-northwind");
    strict_1.default.ok(northwind);
    strict_1.default.equal(northwind.lapsed, true);
    strict_1.default.deepEqual(states(northwind.badges), {
        key_control: "verified",
        owner_binding: "failed",
        capability_probe: "failed",
        screening: "failed",
    });
});
(0, node_test_1.default)("every counterparty in the procurement story shares a card", () => {
    for (const roomId of [
        "room-northwind",
        "room-delta",
        "room-orion",
        "room-vega",
        "room-shell",
    ]) {
        strict_1.default.ok((0, agent_trust_1.counterpartyTrust)(roomId), `${roomId} should have a counterparty profile`);
    }
});
(0, node_test_1.default)("a room outside the procurement story has no counterparty card to show", () => {
    strict_1.default.equal((0, agent_trust_1.counterpartyTrust)("room-weekend"), null);
});
(0, node_test_1.default)("unclaimed checks read as missing, not as verified", () => {
    const badges = (0, trust_badges_1.trustBadges)({
        lapsed: false,
        claims: [
            { key: "key_control", status: "evidence" },
            { key: "owner_binding", status: "unverified" },
        ],
    });
    strict_1.default.equal(states(badges).owner_binding, "missing");
    strict_1.default.equal((0, trust_badges_1.trustSummary)(badges).label, "1 of 4 verified");
});
(0, node_test_1.default)("a deal warns only when the counterparty's agent failed a check", () => {
    var _a, _b;
    strict_1.default.match((_a = (0, trust_badges_1.trustWarning)((0, agent_trust_1.counterpartyTrust)("room-northwind"))) !== null && _a !== void 0 ? _a : "", /profile has expired/);
    strict_1.default.match((_b = (0, trust_badges_1.trustWarning)((0, agent_trust_1.counterpartyTrust)("room-shell"))) !== null && _b !== void 0 ? _b : "", /failed the background check/);
    strict_1.default.equal((0, trust_badges_1.trustWarning)((0, agent_trust_1.buyerTrust)()), null);
});

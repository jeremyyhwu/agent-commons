"use strict";
/**
 * Trust badges — an agent card's four checks as a person reads them.
 *
 * Pure and dependency-free so both the server (seeded cards) and the browser
 * (cards built from /api/agent-card) can use it. Each check is one of:
 * verified (backed by evidence), claimed (self-reported), missing (not even
 * claimed), or failed (lapsed, or contradicted by its own evidence).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TRUST_MEANING = exports.TRUST_LABEL = void 0;
exports.trustBadges = trustBadges;
exports.trustSummary = trustSummary;
exports.trustWarning = trustWarning;
exports.TRUST_LABEL = {
    key_control: "Signed",
    owner_binding: "Real owner",
    capability_probe: "Tested skills",
    screening: "Background check",
};
exports.TRUST_MEANING = {
    key_control: "Its messages are signed with its own key, so nobody can fake them",
    owner_binding: "The company has proved this agent belongs to it",
    capability_probe: "It was tested to really do what it says it can",
    screening: "The company was screened against a fraud list",
};
const ORDER = ["key_control", "owner_binding", "capability_probe", "screening"];
function trustBadges(assessment, opts = {}) {
    return ORDER.map((key) => {
        var _a;
        const claim = assessment.claims.find((c) => c.key === key);
        const status = (_a = claim === null || claim === void 0 ? void 0 : claim.status) !== null && _a !== void 0 ? _a : "unverified";
        if (key === "key_control") {
            return { key, state: status === "evidence" ? "verified" : "failed" };
        }
        if (assessment.lapsed)
            return { key, state: "failed" };
        if (key === "screening" && opts.flagged)
            return { key, state: "failed" };
        if (status === "evidence")
            return { key, state: "verified" };
        if (status === "self_reported")
            return { key, state: "claimed" };
        return { key, state: "missing" };
    });
}
/** One word for the whole card: can I trust this agent? */
function trustSummary(badges) {
    if (badges.some((b) => b.state === "failed"))
        return { tone: "bad", label: "Don't trust" };
    const verified = badges.filter((b) => b.state === "verified").length;
    if (verified === badges.length)
        return { tone: "good", label: "Fully verified" };
    return { tone: "partial", label: `${verified} of ${badges.length} verified` };
}
/**
 * Why a person should think twice before confirming a deal with this agent,
 * or null when nothing failed. Only failed checks warn: "only claimed" is the
 * normal state of most demo cards and would make every deal look alarming.
 */
function trustWarning(agent) {
    const failed = agent.badges.filter((b) => b.state === "failed").map((b) => b.key);
    if (failed.length === 0)
        return null;
    if (failed.includes("key_control")) {
        return `${agent.name}'s messages can't be authenticated — anyone could have sent them.`;
    }
    if (agent.lapsed) {
        return `${agent.name}'s profile has expired, so its owner and background check can no longer be verified.`;
    }
    if (failed.includes("screening")) {
        return `${agent.name} failed the background check.`;
    }
    return `${agent.name} failed a trust check: ${failed.map((k) => exports.TRUST_LABEL[k]).join(", ")}.`;
}

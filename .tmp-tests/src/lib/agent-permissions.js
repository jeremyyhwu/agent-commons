"use strict";
/**
 * Agent permissions — what an agent may tell other agents.
 *
 * This is the card's `owner_policy`: every item is either on `may_disclose`
 * (the agent can share it while negotiating) or on `must_not_disclose` (it
 * never leaves the agent). The UI shows each item as one switch; anything not
 * listed in either is treated as private.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PERMISSION_CATALOG = void 0;
exports.permissionItems = permissionItems;
exports.togglePermission = togglePermission;
exports.completePolicy = completePolicy;
exports.PERMISSION_CATALOG = [
    { key: "spec", label: "Product specs", hint: "What exactly is being bought" },
    { key: "quantity", label: "Order quantity", hint: "How many units" },
    { key: "delivery-window", label: "Delivery window", hint: "When the goods are needed" },
    { key: "target-price-range", label: "Target price range", hint: "The price we hope for" },
    { key: "walk-away-price", label: "Walk-away price", hint: "The most we would ever pay" },
    { key: "budget-ceiling", label: "Budget ceiling", hint: "Total budget for the order" },
    { key: "internal-cost-basis", label: "Internal costs", hint: "Our own cost structure" },
];
/** Every catalog item plus any extra keys the policy mentions, with its switch state. */
function permissionItems(policy) {
    const known = new Set(exports.PERMISSION_CATALOG.map((p) => p.key));
    const extra = [...policy.may, ...policy.never]
        .filter((k, i, all) => !known.has(k) && all.indexOf(k) === i)
        .map((key) => ({ key, label: key.replace(/[-_]/g, " ").replace(/^./, (c) => c.toUpperCase()), hint: "" }));
    return [...exports.PERMISSION_CATALOG, ...extra].map((p) => (Object.assign(Object.assign({}, p), { allowed: policy.may.includes(p.key) })));
}
/** Flip one item between "can share" and "never share". */
function togglePermission(policy, key) {
    const allowed = policy.may.includes(key);
    return allowed
        ? { may: policy.may.filter((k) => k !== key), never: [...policy.never.filter((k) => k !== key), key] }
        : { may: [...policy.may, key], never: policy.never.filter((k) => k !== key) };
}
/** Every switch written out explicitly, so the signed card leaves nothing implicit. */
function completePolicy(policy) {
    const items = permissionItems(policy);
    return {
        may: items.filter((i) => i.allowed).map((i) => i.key),
        never: items.filter((i) => !i.allowed).map((i) => i.key),
    };
}

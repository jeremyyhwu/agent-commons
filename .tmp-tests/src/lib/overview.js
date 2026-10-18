"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FUNNEL_LABELS = exports.OVERVIEW_SCENARIO = void 0;
exports.funnelCounts = funnelCounts;
exports.agentName = agentName;
exports.initials = initials;
exports.dealHistory = dealHistory;
exports.buildOverview = buildOverview;
exports.orderValue = orderValue;
exports.funnelStages = funnelStages;
exports.readableTerms = readableTerms;
const human_signoff_1 = require("./human-signoff");
/**
 * The overview — one page a person can read in five seconds.
 *
 * It tells one story: your buying agent negotiating with several suppliers.
 * Pure derivation over the same rooms, cards and sign-offs the board and the
 * dashboard read — no new data and no state of its own, so the overview cannot
 * disagree with the room pages.
 */
/** The procurement story the overview tells; other scenarios live on their own pages. */
exports.OVERVIEW_SCENARIO = "commercial-terms";
/** A room counts as closed once a human has signed off any of its cards. */
function isConfirmed(cards, signOffs) {
    return cards.some((card) => (0, human_signoff_1.findSignOff)(signOffs, card) !== undefined);
}
/** How far down the funnel a room got: 0 contacted … 3 both agreed. */
const FUNNEL_REACHED = {
    "no-match": 0,
    impasse: 1,
    negotiating: 1,
    partial: 2,
    agreed: 3,
};
function funnelCounts(rooms, signOffs) {
    const reached = (stage) => rooms.filter(({ room }) => FUNNEL_REACHED[room.status] >= stage).length;
    return {
        contacted: rooms.length,
        passedCheck: reached(1),
        supplierAccepted: reached(2),
        bothAgreed: reached(3),
        confirmed: rooms.filter(({ cards }) => isConfirmed(cards, signOffs)).length,
    };
}
/** `Northwind-Supply-Agent.demo` → `Northwind Supply`. */
function agentName(id) {
    const base = id.replace(/\.demo$/, "").replace(/-Agent$/, "");
    const words = base.replace(/[-_]+/g, " ").trim().split(/\s+/).filter(Boolean);
    return words.map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") || id;
}
function initials(name) {
    const words = name.split(/\s+/).filter(Boolean);
    const letters = words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2);
    return letters.toUpperCase();
}
/** The agent that sits in every room — the person's own. Null if there is none. */
function findBuyer(rooms) {
    var _a;
    if (rooms.length === 0)
        return null;
    const [first, ...rest] = rooms;
    return ((_a = first.room.participants.find((p) => rest.every((r) => r.room.participants.includes(p)))) !== null && _a !== void 0 ? _a : null);
}
function supplierStatus(supplier, { room, cards }, signOffs) {
    if (isConfirmed(cards, signOffs))
        return { tone: "done", status: "Deal closed", dropped: null };
    switch (room.status) {
        case "agreed":
            return cards.some((c) => c.agreement === "full" && (0, human_signoff_1.canConfirm)(c, signOffs))
                ? { tone: "you", status: "Deal agreed · waiting for you", dropped: null }
                : { tone: "done", status: "Deal agreed", dropped: null };
        case "partial": {
            const accepted = cards.some((c) => c.status === "agreed" && c.agreed_by.includes(supplier));
            return accepted
                ? { tone: "waiting", status: "Accepted the terms · your agent is deciding", dropped: null }
                : { tone: "active", status: "Considering your agent's offer", dropped: null };
        }
        case "impasse":
            return { tone: "stopped", status: "No deal", dropped: "no-deal" };
        case "no-match":
            return { tone: "blocked", status: "Failed the background check", dropped: "check" };
        default:
            return { tone: "active", status: "Negotiating", dropped: null };
    }
}
/**
 * The deal's history as plain steps. Built only from what the result layer
 * records — who posted which outcome, who agreed, and the human sign-off — so
 * it never invents a conversation; the agents' messages themselves live in
 * their own channel.
 */
function dealHistory({ room, cards }, supplierName, buyerId, signOffs) {
    const who = (id) => (id === buyerId ? `Your agent (${agentName(id)})` : agentName(id));
    const steps = [{ text: `Your agent opened talks with ${supplierName}`, tone: "neutral" }];
    if (room.status === "no-match") {
        steps.push({ text: `Background check flagged ${supplierName} — talks stopped before any offer`, tone: "bad" });
        return steps;
    }
    steps.push({ text: `${supplierName} passed the background check`, tone: "good" });
    const card = cards[0];
    if (!card) {
        steps.push({ text: "Agents are still exchanging offers", tone: "pending" });
        return steps;
    }
    if (card.status === "impasse") {
        steps.push({ text: `No deal: ${card.summary}`, tone: "bad" });
        return steps;
    }
    // Who agreed first, then who is still out — the order things happened in.
    const parties = [...card.required_parties].sort((a, b) => Number(card.agreed_by.includes(b)) - Number(card.agreed_by.includes(a)));
    for (const party of parties) {
        steps.push(card.agreed_by.includes(party)
            ? { text: `${who(party)} agreed to the terms`, tone: "good" }
            : { text: `${who(party)} hasn't agreed yet`, tone: "pending" });
    }
    const signOff = cards.map((c) => (0, human_signoff_1.findSignOff)(signOffs, c)).find(Boolean);
    if (signOff) {
        const when = new Date(signOff.signed_off_at).toLocaleString("en-US", {
            dateStyle: "medium",
            timeStyle: "short",
        });
        steps.push({ text: `${signOff.display_name} confirmed the deal · ${when}`, tone: "good" });
    }
    else if (cards.some((c) => c.agreement === "full" && (0, human_signoff_1.canConfirm)(c, signOffs))) {
        steps.push({ text: "Waiting for your confirmation", tone: "pending" });
    }
    return steps;
}
const TONE_ORDER = {
    you: 0,
    waiting: 1,
    active: 2,
    done: 3,
    stopped: 4,
    blocked: 5,
};
/**
 * Everything the overview shows, for the procurement story only. Rooms from
 * other scenarios (the friends' picnic, live demo runs of other kinds) are left
 * to their own pages so the funnel counts one kind of thing.
 */
function buildOverview(allRooms, signOffs) {
    var _a;
    const rooms = allRooms.filter(({ room }) => room.scenario === exports.OVERVIEW_SCENARIO);
    const buyerId = findBuyer(rooms);
    const suppliers = [];
    const pending = [];
    for (const entry of rooms) {
        const others = entry.room.participants.filter((p) => p !== buyerId);
        const id = (_a = others[0]) !== null && _a !== void 0 ? _a : entry.room.participants[0];
        const name = others.map(agentName).join(", ") || agentName(id);
        const card = entry.cards[0];
        const confirmed = isConfirmed(entry.cards, signOffs);
        suppliers.push(Object.assign({ history: dealHistory(entry, name, buyerId, signOffs), reached: confirmed ? 4 : FUNNEL_REACHED[entry.room.status], value: card ? orderValue(card.terms) : null, id,
            name, initials: initials(name), roomId: entry.room.room_id, summary: entry.room.summary, terms: card ? readableTerms(card.terms) : [] }, supplierStatus(id, entry, signOffs)));
        const waiting = entry.cards.find((c) => c.agreement === "full" && (0, human_signoff_1.canConfirm)(c, signOffs));
        if (waiting)
            pending.push({ room: entry.room, card: waiting, supplier: name });
    }
    suppliers.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
    const buyerName = buyerId ? agentName(buyerId) : null;
    return {
        buyer: buyerId && buyerName ? { id: buyerId, name: buyerName, initials: initials(buyerName) } : null,
        funnel: funnelCounts(rooms, signOffs),
        suppliers,
        pending,
    };
}
/** quantity × unit price, when both are positive numbers. */
function orderValue(terms) {
    const { quantity, unit_price } = terms;
    if (typeof quantity !== "number" || typeof unit_price !== "number")
        return null;
    const value = quantity * unit_price;
    return value > 0 ? Math.round(value * 100) / 100 : null;
}
exports.FUNNEL_LABELS = [
    "Suppliers contacted",
    "Passed background check",
    "Supplier accepted terms",
    "Both sides agreed",
    "Confirmed by you",
];
/** Count, order value and pass-through rate for each funnel stage. */
function funnelStages(suppliers) {
    const stages = exports.FUNNEL_LABELS.map((label, i) => {
        const at = suppliers.filter((s) => s.reached >= i);
        return { label, count: at.length, value: at.reduce((sum, s) => { var _a; return sum + ((_a = s.value) !== null && _a !== void 0 ? _a : 0); }, 0) };
    });
    return stages.map((stage, i) => (Object.assign(Object.assign({}, stage), { pct: i === 0 ? null : stages[i - 1].count === 0 ? 0 : Math.round((stage.count / stages[i - 1].count) * 100) })));
}
const TERM_LABELS = {
    spec: "Item",
    quantity: "Quantity",
    unit_price: "Unit price",
    lead_time_days: "Delivery",
    incoterms: "Incoterms",
    payment_terms: "Payment",
};
/** Card terms as a person reads them: labelled, with units. */
function readableTerms(terms) {
    return Object.entries(terms).map(([key, raw]) => {
        var _a;
        const label = (_a = TERM_LABELS[key]) !== null && _a !== void 0 ? _a : key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
        let value = String(raw);
        if (typeof raw === "number") {
            if (key === "unit_price")
                value = `$${raw.toFixed(2)}`;
            else if (key === "lead_time_days")
                value = `${raw} days`;
            else
                value = raw.toLocaleString("en-US");
        }
        return { label, value };
    });
}

"use strict";
/**
 * The five demo scenarios.
 *
 * All five run on ONE product: multi-party rooms + agent instructions. There
 * is no scenario engine — a scenario is just configuration that seeds each
 * agent's instructions (goals, constraints, completion criteria, result shape).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DATA_PROVENANCE = exports.SCENARIOS = void 0;
exports.scenarioById = scenarioById;
exports.SCENARIOS = [
    {
        id: "commercial-terms",
        label: "Commercial terms",
        blurb: "Two agents converge on item, quantity, price, incoterms and lead time — or reach a clean impasse.",
        multiParty: false,
        theme: "Retail & Commerce",
        termFields: [
            "spec",
            "quantity",
            "unit_price",
            "incoterms",
            "payment_terms",
            "lead_time_days",
        ],
        completion: "All required parties post an agreed card over the same terms hash.",
    },
    {
        id: "startup-investor",
        label: "Startup ↔ investor",
        blurb: "Founder and investor agents discuss fit and agree a next step, or record a clean pass.",
        multiParty: false,
        theme: "General",
        termFields: ["thesis_fit", "check_size", "next_step"],
        completion: "Both sides agree on a next step (a meeting), or record no-match.",
    },
    {
        id: "employer-candidate",
        label: "Employer ↔ candidate",
        blurb: "Agents align on role, experience and expectations, then agree an interview or report misfit.",
        multiParty: false,
        theme: "General",
        termFields: ["role", "seniority", "comp_range", "start_date"],
        completion: "Interview agreed, or incompatibility reported as a first-class result.",
    },
    {
        id: "friends-gathering",
        label: "Friends' gathering",
        blurb: "Three independently owned agents jointly find a time, place and activity that works.",
        multiParty: true,
        theme: "General",
        termFields: ["date", "location", "activity"],
        completion: "All required parties post agreed over the same hash — partial shows as partial.",
    },
    {
        id: "serious-dating",
        label: "Serious dating",
        blurb: "Fictional adult profiles; agents share only authorized criteria and produce a compatibility summary.",
        multiParty: false,
        theme: "General",
        termFields: ["shared_interests", "relationship_intent", "location", "compatibility_summary"],
        completion: "A mutually acceptable next step, or no-match. No compatibility guarantee.",
    },
];
function scenarioById(id) {
    return exports.SCENARIOS.find((s) => s.id === id);
}
/**
 * Data provenance, shown on the board and live-demo pages.
 *
 * The hackathon requires the demo to explain where its data comes from;
 * synthetic data that is clearly labelled is explicitly acceptable.
 */
exports.DATA_PROVENANCE = "Data: synthetic demo dataset, clearly labelled per hackathon rules — " +
    "no real companies, prices or counterparties. Board rooms are seeded; " +
    "the live negotiation above runs the real engine on demo inputs.";

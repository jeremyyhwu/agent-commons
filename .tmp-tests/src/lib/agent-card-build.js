"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAgentCard = createAgentCard;
const keys_1 = require("./keys");
function makeEvidence(producer, type, method, produced_by, payload) {
    return {
        type,
        method,
        produced_by,
        issuer: producer.publicKeyRaw,
        issued_at: new Date().toISOString(),
        payload,
        evidence_sig: (0, keys_1.signValue)(payload, producer.privateKey),
    };
}
function createAgentCard(input, keys = (0, keys_1.generateAgentKeyPair)()) {
    var _a, _b, _c, _d, _e, _f, _g;
    const agentId = keys.publicKeyRaw;
    const levels = (_a = input.levels) !== null && _a !== void 0 ? _a : {};
    const caps = (_b = input.capabilities) !== null && _b !== void 0 ? _b : [];
    const claims = {
        key_control: {
            status: "evidence",
            evidence: makeEvidence(keys, "signature", "ed25519-over-card", "self", { agent_id: agentId }),
            note: "The card signature itself — verifiable by anyone.",
        },
        owner_binding: levels.owner_binding
            ? (() => {
                var _a;
                // A separate owner key signs a challenge bound to this agent key.
                const ownerKeys = (0, keys_1.generateAgentKeyPair)();
                return {
                    status: "evidence",
                    evidence: makeEvidence(ownerKeys, "domain-challenge", "owner-key-signs-challenge", "owner", {
                        agent_id: agentId,
                        nonce: crypto.randomUUID().slice(0, 8),
                        contact: (_a = input.owner_contact) !== null && _a !== void 0 ? _a : null,
                        scope: "key-control-only",
                    }),
                    note: "Proves the owner's key controls this agent key. Not a legal identity, not authority to represent an organisation.",
                };
            })()
            : { status: "unverified", evidence: null, note: "No owner-binding evidence supplied." },
        capability_probe: levels.capability_probe
            ? {
                status: "self_reported",
                evidence: makeEvidence(keys, "probe-result", "probe.constraint-check.v1", "self", {
                    agent_id: agentId,
                    probe: "constraint-check",
                    capabilities: caps,
                    result: "pass",
                }),
                note: "Self-reported. Proves authorship of the result, not independent execution.",
            }
            : { status: "self_reported", evidence: null, note: "Capabilities claimed, no probe result." },
        screening: levels.screening
            ? {
                status: "self_reported",
                evidence: makeEvidence(keys, "list-check", "local-list-check-v1", "self", {
                    agent_id: agentId,
                    list: "synthetic-demo-list-v1",
                    list_version: "2026-10-13",
                    matched: false,
                }),
                note: "Self-reported. A local list check — no independent authority is involved.",
            }
            : { status: "unverified", evidence: null, note: "Not screened in this demo." },
    };
    const body = {
        type: "agent_card",
        v: 1,
        agent_id: agentId,
        display_name: input.display_name,
        owner: { name: input.owner_name, contact: (_c = input.owner_contact) !== null && _c !== void 0 ? _c : null },
        purpose: (_d = input.purpose) !== null && _d !== void 0 ? _d : [],
        capabilities: caps,
        owner_policy: {
            may_disclose: (_e = input.may_disclose) !== null && _e !== void 0 ? _e : [],
            must_not_disclose: (_f = input.must_not_disclose) !== null && _f !== void 0 ? _f : [],
        },
        claims,
        expires_at: (_g = input.expires_at) !== null && _g !== void 0 ? _g : null,
        revocation: { revoked: false, reason: null, at: null },
    };
    return Object.assign(Object.assign({}, body), { sig: (0, keys_1.signValue)(body, keys.privateKey) });
}

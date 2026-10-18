"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserProfile = getUserProfile;
exports.upsertUserProfile = upsertUserProfile;
exports.listUserInteractions = listUserInteractions;
exports.saveUserInteraction = saveUserInteraction;
exports.getOrganization = getOrganization;
exports.createOrganization = createOrganization;
exports.listAgents = listAgents;
exports.registerAgent = registerAgent;
exports.listNegotiations = listNegotiations;
exports.getNegotiation = getNegotiation;
exports.createNegotiationWithInitialProposal = createNegotiationWithInitialProposal;
exports.listProposals = listProposals;
exports.addProposalCounteroffer = addProposalCounteroffer;
exports.signAndAcceptProposal = signAndAcceptProposal;
exports.getNegotiationWithProposals = getNegotiationWithProposals;
exports.addMessage = addMessage;
exports.listMessages = listMessages;
exports.saveInteraction = saveInteraction;
const firestore_1 = require("firebase/firestore");
const firebase_1 = require("./firebase");
const browser_crypto_1 = require("./browser-crypto");
// ----------------- USER PROFILE -----------------
async function getUserProfile(uid) {
    const path = `users/${uid}`;
    try {
        const snap = await (0, firestore_1.getDoc)((0, firestore_1.doc)(firebase_1.db, "users", uid));
        if (!snap.exists())
            return null;
        return snap.data();
    }
    catch (error) {
        (0, firebase_1.handleFirestoreError)(error, firebase_1.OperationType.GET, path);
    }
}
async function upsertUserProfile(uid, data) {
    var _a, _b;
    const path = `users/${uid}`;
    const now = new Date().toISOString();
    try {
        const existing = await getUserProfile(uid);
        const profile = {
            uid,
            displayName: data.displayName || (existing === null || existing === void 0 ? void 0 : existing.displayName) || "Anonymous User",
            email: (_b = (_a = data.email) !== null && _a !== void 0 ? _a : existing === null || existing === void 0 ? void 0 : existing.email) !== null && _b !== void 0 ? _b : null,
            defaultOrgId: data.defaultOrgId || (existing === null || existing === void 0 ? void 0 : existing.defaultOrgId) || `org_${uid.slice(0, 8)}`,
            role: (existing === null || existing === void 0 ? void 0 : existing.role) || "user",
            createdAt: (existing === null || existing === void 0 ? void 0 : existing.createdAt) || now,
            updatedAt: now,
        };
        await (0, firestore_1.setDoc)((0, firestore_1.doc)(firebase_1.db, "users", uid), (0, firebase_1.sanitizePayload)(profile), { merge: true });
        return profile;
    }
    catch (error) {
        (0, firebase_1.handleFirestoreError)(error, firebase_1.OperationType.WRITE, path);
    }
}
// ----------------- USER INTERACTIONS / HISTORY -----------------
async function listUserInteractions(userId) {
    const path = `users/${userId}/interactions`;
    try {
        const snap = await (0, firestore_1.getDocs)((0, firestore_1.collection)(firebase_1.db, "users", userId, "interactions"));
        return snap.docs.map((d) => (Object.assign(Object.assign({}, d.data()), { id: d.id })));
    }
    catch (error) {
        (0, firebase_1.handleFirestoreError)(error, firebase_1.OperationType.LIST, path);
    }
}
async function saveUserInteraction(userId, interaction) {
    const interactionId = interaction.id || `session_${Date.now()}`;
    const path = `users/${userId}/interactions/${interactionId}`;
    const now = new Date().toISOString();
    try {
        const record = Object.assign(Object.assign({}, interaction), { id: interactionId, createdAt: now, updatedAt: now });
        await (0, firestore_1.setDoc)((0, firestore_1.doc)(firebase_1.db, "users", userId, "interactions", interactionId), (0, firebase_1.sanitizePayload)(record), {
            merge: true,
        });
        return record;
    }
    catch (error) {
        (0, firebase_1.handleFirestoreError)(error, firebase_1.OperationType.WRITE, path);
    }
}
// ----------------- ORGANIZATIONS -----------------
async function getOrganization(orgId) {
    const path = `organizations/${orgId}`;
    try {
        const snap = await (0, firestore_1.getDoc)((0, firestore_1.doc)(firebase_1.db, "organizations", orgId));
        if (!snap.exists())
            return null;
        return Object.assign(Object.assign({}, snap.data()), { id: snap.id });
    }
    catch (error) {
        (0, firebase_1.handleFirestoreError)(error, firebase_1.OperationType.GET, path);
    }
}
async function createOrganization(org) {
    const path = `organizations/${org.id}`;
    const now = new Date().toISOString();
    try {
        const record = Object.assign(Object.assign({}, org), { createdAt: now, updatedAt: now });
        await (0, firestore_1.setDoc)((0, firestore_1.doc)(firebase_1.db, "organizations", org.id), (0, firebase_1.sanitizePayload)(record));
        // Also record member
        await (0, firestore_1.setDoc)((0, firestore_1.doc)(firebase_1.db, "organizations", org.id, "members", org.ownerUid), {
            role: "admin",
            status: "active",
            joinedAt: now,
        });
        return record;
    }
    catch (error) {
        (0, firebase_1.handleFirestoreError)(error, firebase_1.OperationType.CREATE, path);
    }
}
// ----------------- AGENTS -----------------
async function listAgents(ownerOrgId) {
    const path = "agents";
    try {
        const q = (0, firestore_1.collection)(firebase_1.db, "agents");
        if (ownerOrgId) {
            const filtered = (0, firestore_1.query)(q, (0, firestore_1.where)("ownerOrgId", "==", ownerOrgId));
            const snap = await (0, firestore_1.getDocs)(filtered);
            return snap.docs.map((d) => (Object.assign(Object.assign({}, d.data()), { id: d.id })));
        }
        const snap = await (0, firestore_1.getDocs)(q);
        return snap.docs.map((d) => (Object.assign(Object.assign({}, d.data()), { id: d.id })));
    }
    catch (error) {
        (0, firebase_1.handleFirestoreError)(error, firebase_1.OperationType.LIST, path);
    }
}
async function registerAgent(agent) {
    var _a;
    const path = `agents/${agent.id}`;
    const now = new Date().toISOString();
    try {
        // Use the caller-supplied key pair (from the agent card) when provided,
        // so the Firestore record's publicKey matches the card's agent_id.
        const keys = agent.keyPair || (0, browser_crypto_1.generateUniversalKeyPair)();
        // If the card's signature and owner-binding already exist (the card was
        // built elsewhere with this same key pair), use them directly instead of
        // regenerating a different card signature and a separate owner key pair.
        const cardSignature = (_a = agent.cardSignature) !== null && _a !== void 0 ? _a : (0, browser_crypto_1.signUniversalValue)({
            id: agent.id,
            name: agent.name,
            ownerOrgId: agent.ownerOrgId,
            businessRole: agent.businessRole,
            sector: agent.sector,
        }, keys.secretKey);
        const ownerBinding = agent.ownerBinding
            ? {
                ownerPublicKey: agent.ownerBinding.ownerPublicKey,
                agentId: agent.id,
                signature: agent.ownerBinding.signature,
            }
            : (() => {
                const ownerKeys = (0, browser_crypto_1.generateUniversalKeyPair)();
                return {
                    ownerPublicKey: ownerKeys.publicKeyRaw,
                    agentId: agent.id,
                    signature: (0, browser_crypto_1.signUniversalValue)({ ownerPublicKey: ownerKeys.publicKeyRaw, agentId: agent.id }, ownerKeys.secretKey),
                };
            })();
        const record = {
            id: agent.id,
            ownerOrgId: agent.ownerOrgId,
            createdByUid: agent.createdByUid,
            name: agent.name,
            businessRole: agent.businessRole,
            sector: agent.sector,
            agentCardUrl: agent.agentCardUrl || `https://agentcommons.org/agents/${agent.id}/card.json`,
            protocolVersion: agent.protocolVersion || "1.0",
            status: "active",
            publicKey: keys.publicKeyRaw,
            cardSignature,
            ownerBinding,
            claims: agent.claims || [
                { field: "businessRole", state: "self_reported" },
                { field: "sector", state: "unverified" },
            ],
            createdAt: now,
            updatedAt: now,
        };
        await (0, firestore_1.setDoc)((0, firestore_1.doc)(firebase_1.db, "agents", agent.id), (0, firebase_1.sanitizePayload)(record));
        return record;
    }
    catch (error) {
        (0, firebase_1.handleFirestoreError)(error, firebase_1.OperationType.CREATE, path);
    }
}
// ----------------- NEGOTIATIONS & PROPOSALS -----------------
async function listNegotiations() {
    const path = "negotiations";
    try {
        const snap = await (0, firestore_1.getDocs)((0, firestore_1.collection)(firebase_1.db, "negotiations"));
        return snap.docs.map((d) => (Object.assign(Object.assign({}, d.data()), { id: d.id })));
    }
    catch (error) {
        (0, firebase_1.handleFirestoreError)(error, firebase_1.OperationType.LIST, path);
    }
}
async function getNegotiation(negotiationId) {
    const path = `negotiations/${negotiationId}`;
    try {
        const snap = await (0, firestore_1.getDoc)((0, firestore_1.doc)(firebase_1.db, "negotiations", negotiationId));
        if (!snap.exists())
            return null;
        return Object.assign(Object.assign({}, snap.data()), { id: snap.id });
    }
    catch (error) {
        (0, firebase_1.handleFirestoreError)(error, firebase_1.OperationType.GET, path);
    }
}
async function createNegotiationWithInitialProposal(params) {
    const { negotiation, initialTerms, proposerKeys } = params;
    const negPath = `negotiations/${negotiation.id}`;
    const now = new Date().toISOString();
    try {
        const termsHash = (0, browser_crypto_1.computeTermsHash)(initialTerms);
        const initialSig = (0, browser_crypto_1.signUniversalValue)({ termsHash, party: negotiation.createdBy.orgId }, proposerKeys.secretKey);
        const proposalId = negotiation.currentProposalId || "prop_001";
        const proposal = {
            id: proposalId,
            sequence: 1,
            proposalType: "offer",
            status: "pending",
            proposerOrgId: negotiation.createdBy.orgId,
            proposerAgentId: negotiation.createdBy.agentId,
            terms: initialTerms,
            termsHash,
            signatures: [
                {
                    partyOrgId: negotiation.createdBy.orgId,
                    agentId: negotiation.createdBy.agentId,
                    publicKey: proposerKeys.publicKeyRaw,
                    sig: initialSig,
                },
            ],
            totalAmountMinor: initialTerms.items.reduce((s, it) => s + it.lineTotalMinor, 0),
            currency: initialTerms.currency,
            createdAt: now,
            updatedAt: now,
        };
        const negRecord = Object.assign(Object.assign({}, negotiation), { currentProposalId: proposalId, state: "negotiating", stateHash: termsHash, lifecycle: "open", createdAt: now, updatedAt: now });
        await (0, firestore_1.setDoc)((0, firestore_1.doc)(firebase_1.db, "negotiations", negotiation.id), (0, firebase_1.sanitizePayload)(negRecord));
        await (0, firestore_1.setDoc)((0, firestore_1.doc)(firebase_1.db, "negotiations", negotiation.id, "proposals", proposalId), (0, firebase_1.sanitizePayload)(proposal));
        return { negotiation: negRecord, proposal };
    }
    catch (error) {
        (0, firebase_1.handleFirestoreError)(error, firebase_1.OperationType.CREATE, negPath);
    }
}
async function listProposals(negotiationId) {
    const path = `negotiations/${negotiationId}/proposals`;
    try {
        const snap = await (0, firestore_1.getDocs)((0, firestore_1.collection)(firebase_1.db, "negotiations", negotiationId, "proposals"));
        const list = snap.docs.map((d) => (Object.assign(Object.assign({}, d.data()), { id: d.id })));
        return list.sort((a, b) => a.sequence - b.sequence);
    }
    catch (error) {
        (0, firebase_1.handleFirestoreError)(error, firebase_1.OperationType.LIST, path);
    }
}
async function addProposalCounteroffer(params) {
    const { negotiationId, counterTerms, proposerOrgId, proposerAgentId, proposerKeys, sequence } = params;
    const path = `negotiations/${negotiationId}/proposals`;
    const now = new Date().toISOString();
    try {
        const termsHash = (0, browser_crypto_1.computeTermsHash)(counterTerms);
        const sig = (0, browser_crypto_1.signUniversalValue)({ termsHash, party: proposerOrgId }, proposerKeys.secretKey);
        const proposalId = `prop_${String(sequence).padStart(3, "0")}`;
        const totalAmountMinor = counterTerms.items.reduce((s, it) => s + it.lineTotalMinor, 0);
        const proposal = {
            id: proposalId,
            sequence,
            proposalType: "counteroffer",
            status: "pending",
            proposerOrgId,
            proposerAgentId,
            terms: counterTerms,
            termsHash,
            signatures: [
                {
                    partyOrgId: proposerOrgId,
                    agentId: proposerAgentId,
                    publicKey: proposerKeys.publicKeyRaw,
                    sig,
                },
            ],
            totalAmountMinor,
            currency: counterTerms.currency,
            createdAt: now,
            updatedAt: now,
        };
        await (0, firestore_1.setDoc)((0, firestore_1.doc)(firebase_1.db, "negotiations", negotiationId, "proposals", proposalId), (0, firebase_1.sanitizePayload)(proposal));
        await (0, firestore_1.updateDoc)((0, firestore_1.doc)(firebase_1.db, "negotiations", negotiationId), (0, firebase_1.sanitizePayload)({
            currentProposalId: proposalId,
            currentRound: sequence,
            currentTotalAmountMinor: totalAmountMinor,
            lastActivityAt: now,
            updatedAt: now,
        }));
        return proposal;
    }
    catch (error) {
        (0, firebase_1.handleFirestoreError)(error, firebase_1.OperationType.WRITE, path);
    }
}
async function signAndAcceptProposal(params) {
    const { negotiationId, proposalId, signingOrgId, signingAgentId, signingKeys } = params;
    const path = `negotiations/${negotiationId}/proposals/${proposalId}`;
    const now = new Date().toISOString();
    try {
        const propSnap = await (0, firestore_1.getDoc)((0, firestore_1.doc)(firebase_1.db, "negotiations", negotiationId, "proposals", proposalId));
        if (!propSnap.exists())
            throw new Error("Proposal not found");
        const proposal = propSnap.data();
        const negSnap = await (0, firestore_1.getDoc)((0, firestore_1.doc)(firebase_1.db, "negotiations", negotiationId));
        if (!negSnap.exists())
            throw new Error("Negotiation not found");
        const neg = negSnap.data();
        const sig = (0, browser_crypto_1.signUniversalValue)({ termsHash: proposal.termsHash, party: signingOrgId }, signingKeys.secretKey);
        const existingSigs = proposal.signatures || [];
        const updatedSigs = existingSigs.filter((s) => s.partyOrgId !== signingOrgId);
        updatedSigs.push({
            partyOrgId: signingOrgId,
            agentId: signingAgentId,
            publicKey: signingKeys.publicKeyRaw,
            sig,
        });
        const isAgreed = updatedSigs.length >= (neg.acceptanceRule.minAgreed || 2);
        const newState = isAgreed ? "agreed" : "partial";
        const finalProposal = Object.assign(Object.assign({}, proposal), { signatures: updatedSigs, status: isAgreed ? "accepted" : "pending", updatedAt: now });
        await (0, firestore_1.setDoc)((0, firestore_1.doc)(firebase_1.db, "negotiations", negotiationId, "proposals", proposalId), (0, firebase_1.sanitizePayload)(finalProposal));
        await (0, firestore_1.updateDoc)((0, firestore_1.doc)(firebase_1.db, "negotiations", negotiationId), (0, firebase_1.sanitizePayload)({
            currentProposalId: proposalId,
            state: newState,
            lifecycle: isAgreed ? "open" : "awaiting_response",
            lastActivityAt: now,
            updatedAt: now,
        }));
        return { proposal: finalProposal, state: newState };
    }
    catch (error) {
        (0, firebase_1.handleFirestoreError)(error, firebase_1.OperationType.WRITE, path);
    }
}
// ----------------- NEGOTIATION READ (with proposals) -----------------
/**
 * Read a negotiation together with its sorted proposals. Used by API routes
 * and state recomputation. The proposals are needed to recompute `state`
 * (which is derived, not stored).
 */
async function getNegotiationWithProposals(negotiationId) {
    const path = `negotiations/${negotiationId}`;
    try {
        const negSnap = await (0, firestore_1.getDoc)((0, firestore_1.doc)(firebase_1.db, "negotiations", negotiationId));
        if (!negSnap.exists())
            return null;
        const negotiation = Object.assign(Object.assign({}, negSnap.data()), { id: negSnap.id });
        const proposals = await listProposals(negotiationId);
        return Object.assign(Object.assign({}, negotiation), { proposals });
    }
    catch (error) {
        (0, firebase_1.handleFirestoreError)(error, firebase_1.OperationType.GET, path);
    }
}
// ----------------- MESSAGES -----------------
/**
 * Persist a message on the negotiation's subcollection. Messages are stored
 * and retrievable, but — per user-data-guide §5 — no state transition depends
 * on them. They are correlation/audit data only.
 */
async function addMessage(negotiationId, message) {
    const path = `negotiations/${negotiationId}/messages`;
    const now = new Date().toISOString();
    try {
        const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const record = Object.assign(Object.assign({}, message), { id, createdAt: now });
        await (0, firestore_1.setDoc)((0, firestore_1.doc)(firebase_1.db, "negotiations", negotiationId, "messages", id), (0, firebase_1.sanitizePayload)(record));
        return record;
    }
    catch (error) {
        (0, firebase_1.handleFirestoreError)(error, firebase_1.OperationType.WRITE, path);
    }
}
async function listMessages(negotiationId) {
    const path = `negotiations/${negotiationId}/messages`;
    try {
        const snap = await (0, firestore_1.getDocs)((0, firestore_1.collection)(firebase_1.db, "negotiations", negotiationId, "messages"));
        return snap.docs
            .map((d) => (Object.assign(Object.assign({}, d.data()), { id: d.id })))
            .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    }
    catch (error) {
        (0, firebase_1.handleFirestoreError)(error, firebase_1.OperationType.LIST, path);
    }
}
// ----------------- INTERACTIONS -----------------
/**
 * Persist an A2A interaction record that correlates to a negotiation.
 * Links remote task/context IDs to the negotiation for cross-reference.
 */
async function saveInteraction(userId, interaction) {
    return saveUserInteraction(userId, interaction);
}

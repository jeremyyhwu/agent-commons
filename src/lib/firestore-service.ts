import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType, sanitizePayload } from "./firebase";
import {
  computeTermsHash,
  generateUniversalKeyPair,
  signUniversalValue,
  type UniversalKeyPair,
} from "./browser-crypto";

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string | null;
  defaultOrgId?: string;
  role: "user" | "admin";
  createdAt: string;
  updatedAt: string;
}

export interface UserInteractionSession {
  id: string;
  title: string;
  summary: string;
  agentId: string;
  negotiationId?: string;
  chatHistory?: Array<{
    role: string;
    text: string;
    timestamp: string;
  }>;
  status: "active" | "archived" | "closed";
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationRecord {
  id: string;
  name: string;
  sector: string;
  businessType: "buyer" | "supplier" | "partner";
  countryCode: string;
  defaultCurrency: string;
  status: "active" | "suspended";
  ownerUid: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentRecord {
  id: string;
  ownerOrgId: string;
  createdByUid: string;
  name: string;
  businessRole: "buyer" | "supplier" | "mediator";
  sector: string;
  agentCardUrl: string;
  protocolVersion: string;
  status: "active" | "revoked";
  publicKey: string;
  cardSignature: string;
  ownerBinding: {
    ownerPublicKey: string;
    agentId: string;
    signature: string;
  };
  claims: Array<{ field: string; state: "evidence" | "self_reported" | "unverified" }>;
  createdAt: string;
  updatedAt: string;
}

export interface ProposalItem {
  productRef: string;
  sku: string;
  description: string;
  quantity: number;
  unit: string;
  unitPriceMinor: number;
  lineTotalMinor: number;
}

export interface ProposalTerms {
  currency: string;
  items: ProposalItem[];
  payment: { method: string; dueDays: number };
  delivery: { method: string; shippingCostMinor: number };
  validUntil?: string;
}

export interface SignatureRecord {
  partyOrgId: string;
  agentId: string;
  publicKey: string;
  sig: string;
}

export interface ProposalRecord {
  id: string;
  sequence: number;
  proposalType: "offer" | "counteroffer" | "final";
  status: "pending" | "accepted" | "rejected" | "withdrawn" | "expired" | "superseded";
  proposerOrgId: string;
  proposerAgentId: string;
  terms: ProposalTerms;
  termsHash: string;
  signatures: SignatureRecord[];
  totalAmountMinor: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface AcceptanceRule {
  kind: "unanimous" | "quorum" | "explicit";
  requiredParties: string[];
  minAgreed: number;
}

export interface NegotiationRecord {
  id: string;
  schemaVersion: number;
  title: string;
  negotiationType: string;
  sector: string;
  participantOrgIds: string[];
  participantAgentIds: string[];
  createdBy: { uid: string; orgId: string; agentId: string };
  currentProposalId: string;
  currentRound: number;
  nextActionOrgId: string;
  currentTotalAmountMinor: number;
  currency: string;
  acceptanceRule: AcceptanceRule;
  state: "negotiating" | "agreed" | "partial" | "impasse" | "no-match";
  stateHash: string;
  lifecycle: "draft" | "open" | "awaiting_response" | "declined" | "withdrawn" | "expired" | "cancelled";
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface MessageRecord {
  id: string;
  senderUid: string;
  senderAgentId: string;
  senderOrgId: string;
  content: string;
  createdAt: string;
}

// ----------------- USER PROFILE -----------------

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return null;
    return snap.data() as UserProfile;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function upsertUserProfile(
  uid: string,
  data: Partial<UserProfile>,
): Promise<UserProfile> {
  const path = `users/${uid}`;
  const now = new Date().toISOString();
  try {
    const existing = await getUserProfile(uid);
    const profile: UserProfile = {
      uid,
      displayName: data.displayName || existing?.displayName || "Anonymous User",
      email: data.email ?? existing?.email ?? null,
      defaultOrgId: data.defaultOrgId || existing?.defaultOrgId || `org_${uid.slice(0, 8)}`,
      role: existing?.role || "user",
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    await setDoc(doc(db, "users", uid), sanitizePayload(profile), { merge: true });
    return profile;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// ----------------- USER INTERACTIONS / HISTORY -----------------

export async function listUserInteractions(userId: string): Promise<UserInteractionSession[]> {
  const path = `users/${userId}/interactions`;
  try {
    const snap = await getDocs(collection(db, "users", userId, "interactions"));
    return snap.docs.map((d) => ({ ...d.data(), id: d.id }) as UserInteractionSession);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function saveUserInteraction(
  userId: string,
  interaction: Omit<UserInteractionSession, "id" | "createdAt" | "updatedAt"> & { id?: string },
): Promise<UserInteractionSession> {
  const interactionId = interaction.id || `session_${Date.now()}`;
  const path = `users/${userId}/interactions/${interactionId}`;
  const now = new Date().toISOString();
  try {
    const record: UserInteractionSession = {
      ...interaction,
      id: interactionId,
      createdAt: now,
      updatedAt: now,
    };
    await setDoc(doc(db, "users", userId, "interactions", interactionId), sanitizePayload(record), {
      merge: true,
    });
    return record;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// ----------------- ORGANIZATIONS -----------------

export async function getOrganization(orgId: string): Promise<OrganizationRecord | null> {
  const path = `organizations/${orgId}`;
  try {
    const snap = await getDoc(doc(db, "organizations", orgId));
    if (!snap.exists()) return null;
    return { ...snap.data(), id: snap.id } as OrganizationRecord;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function createOrganization(
  org: Omit<OrganizationRecord, "createdAt" | "updatedAt">,
): Promise<OrganizationRecord> {
  const path = `organizations/${org.id}`;
  const now = new Date().toISOString();
  try {
    const record: OrganizationRecord = {
      ...org,
      createdAt: now,
      updatedAt: now,
    };
    await setDoc(doc(db, "organizations", org.id), sanitizePayload(record));
    // Also record member
    await setDoc(doc(db, "organizations", org.id, "members", org.ownerUid), {
      role: "admin",
      status: "active",
      joinedAt: now,
    });
    return record;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

// ----------------- AGENTS -----------------

export async function listAgents(ownerOrgId?: string): Promise<AgentRecord[]> {
  const path = "agents";
  try {
    const q = collection(db, "agents");
    if (ownerOrgId) {
      const filtered = query(q, where("ownerOrgId", "==", ownerOrgId));
      const snap = await getDocs(filtered);
      return snap.docs.map((d) => ({ ...d.data(), id: d.id }) as AgentRecord);
    }
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ ...d.data(), id: d.id }) as AgentRecord);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function registerAgent(
  agent: Omit<AgentRecord, "createdAt" | "updatedAt" | "publicKey" | "cardSignature" | "ownerBinding"> & {
    keyPair?: UniversalKeyPair;
    cardSignature?: string;
    ownerBinding?: {
      ownerPublicKey: string;
      signature: string;
    };
  },
): Promise<AgentRecord> {
  const path = `agents/${agent.id}`;
  const now = new Date().toISOString();
  try {
    // Use the caller-supplied key pair (from the agent card) when provided,
    // so the Firestore record's publicKey matches the card's agent_id.
    const keys = agent.keyPair || generateUniversalKeyPair();

    // If the card's signature and owner-binding already exist (the card was
    // built elsewhere with this same key pair), use them directly instead of
    // regenerating a different card signature and a separate owner key pair.
    const cardSignature = agent.cardSignature ?? signUniversalValue(
      {
        id: agent.id,
        name: agent.name,
        ownerOrgId: agent.ownerOrgId,
        businessRole: agent.businessRole,
        sector: agent.sector,
      },
      keys.secretKey,
    );

    const ownerBinding = agent.ownerBinding
      ? {
          ownerPublicKey: agent.ownerBinding.ownerPublicKey,
          agentId: agent.id,
          signature: agent.ownerBinding.signature,
        }
      : (() => {
          const ownerKeys = generateUniversalKeyPair();
          return {
            ownerPublicKey: ownerKeys.publicKeyRaw,
            agentId: agent.id,
            signature: signUniversalValue(
              { ownerPublicKey: ownerKeys.publicKeyRaw, agentId: agent.id },
              ownerKeys.secretKey,
            ),
          };
        })();

    const record: AgentRecord = {
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

    await setDoc(doc(db, "agents", agent.id), sanitizePayload(record));
    return record;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

// ----------------- NEGOTIATIONS & PROPOSALS -----------------

export async function listNegotiations(): Promise<NegotiationRecord[]> {
  const path = "negotiations";
  try {
    const snap = await getDocs(collection(db, "negotiations"));
    return snap.docs.map((d) => ({ ...d.data(), id: d.id }) as NegotiationRecord);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function getNegotiation(negotiationId: string): Promise<NegotiationRecord | null> {
  const path = `negotiations/${negotiationId}`;
  try {
    const snap = await getDoc(doc(db, "negotiations", negotiationId));
    if (!snap.exists()) return null;
    return { ...snap.data(), id: snap.id } as NegotiationRecord;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function createNegotiationWithInitialProposal(params: {
  negotiation: Omit<NegotiationRecord, "createdAt" | "updatedAt">;
  initialTerms: ProposalTerms;
  proposerKeys: UniversalKeyPair;
}): Promise<{ negotiation: NegotiationRecord; proposal: ProposalRecord }> {
  const { negotiation, initialTerms, proposerKeys } = params;
  const negPath = `negotiations/${negotiation.id}`;
  const now = new Date().toISOString();

  try {
    const termsHash = computeTermsHash(initialTerms);
    const initialSig = signUniversalValue(
      { termsHash, party: negotiation.createdBy.orgId },
      proposerKeys.secretKey,
    );

    const proposalId = negotiation.currentProposalId || "prop_001";
    const proposal: ProposalRecord = {
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

    const negRecord: NegotiationRecord = {
      ...negotiation,
      currentProposalId: proposalId,
      state: "negotiating",
      stateHash: termsHash,
      lifecycle: "open",
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(doc(db, "negotiations", negotiation.id), sanitizePayload(negRecord));
    await setDoc(
      doc(db, "negotiations", negotiation.id, "proposals", proposalId),
      sanitizePayload(proposal),
    );

    return { negotiation: negRecord, proposal };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, negPath);
  }
}

export async function listProposals(negotiationId: string): Promise<ProposalRecord[]> {
  const path = `negotiations/${negotiationId}/proposals`;
  try {
    const snap = await getDocs(collection(db, "negotiations", negotiationId, "proposals"));
    const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }) as ProposalRecord);
    return list.sort((a, b) => a.sequence - b.sequence);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function addProposalCounteroffer(params: {
  negotiationId: string;
  counterTerms: ProposalTerms;
  proposerOrgId: string;
  proposerAgentId: string;
  proposerKeys: UniversalKeyPair;
  sequence: number;
}): Promise<ProposalRecord> {
  const { negotiationId, counterTerms, proposerOrgId, proposerAgentId, proposerKeys, sequence } =
    params;
  const path = `negotiations/${negotiationId}/proposals`;
  const now = new Date().toISOString();
  try {
    const termsHash = computeTermsHash(counterTerms);
    const sig = signUniversalValue({ termsHash, party: proposerOrgId }, proposerKeys.secretKey);
    const proposalId = `prop_${String(sequence).padStart(3, "0")}`;

    const totalAmountMinor = counterTerms.items.reduce((s, it) => s + it.lineTotalMinor, 0);
    const proposal: ProposalRecord = {
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

    await setDoc(doc(db, "negotiations", negotiationId, "proposals", proposalId), sanitizePayload(proposal));
    await updateDoc(
      doc(db, "negotiations", negotiationId),
      sanitizePayload({
        currentProposalId: proposalId,
        currentRound: sequence,
        currentTotalAmountMinor: totalAmountMinor,
        lastActivityAt: now,
        updatedAt: now,
      }),
    );

    return proposal;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function signAndAcceptProposal(params: {
  negotiationId: string;
  proposalId: string;
  signingOrgId: string;
  signingAgentId: string;
  signingKeys: UniversalKeyPair;
}): Promise<{ proposal: ProposalRecord; state: NegotiationRecord["state"] }> {
  const { negotiationId, proposalId, signingOrgId, signingAgentId, signingKeys } = params;
  const path = `negotiations/${negotiationId}/proposals/${proposalId}`;
  const now = new Date().toISOString();
  try {
    const propSnap = await getDoc(doc(db, "negotiations", negotiationId, "proposals", proposalId));
    if (!propSnap.exists()) throw new Error("Proposal not found");
    const proposal = propSnap.data() as ProposalRecord;

    const negSnap = await getDoc(doc(db, "negotiations", negotiationId));
    if (!negSnap.exists()) throw new Error("Negotiation not found");
    const neg = negSnap.data() as NegotiationRecord;

    const sig = signUniversalValue(
      { termsHash: proposal.termsHash, party: signingOrgId },
      signingKeys.secretKey,
    );
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
    const finalProposal: ProposalRecord = {
      ...proposal,
      signatures: updatedSigs,
      status: isAgreed ? "accepted" : "pending",
      updatedAt: now,
    };

    await setDoc(
      doc(db, "negotiations", negotiationId, "proposals", proposalId),
      sanitizePayload(finalProposal),
    );
    await updateDoc(
      doc(db, "negotiations", negotiationId),
      sanitizePayload({
        currentProposalId: proposalId,
        state: newState,
        lifecycle: isAgreed ? "open" : "awaiting_response",
        lastActivityAt: now,
        updatedAt: now,
      }),
    );

    return { proposal: finalProposal, state: newState };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// ----------------- NEGOTIATION READ (with proposals) -----------------

/**
 * Read a negotiation together with its sorted proposals. Used by API routes
 * and state recomputation. The proposals are needed to recompute `state`
 * (which is derived, not stored).
 */
export async function getNegotiationWithProposals(
  negotiationId: string,
): Promise<(NegotiationRecord & { proposals: ProposalRecord[] }) | null> {
  const path = `negotiations/${negotiationId}`;
  try {
    const negSnap = await getDoc(doc(db, "negotiations", negotiationId));
    if (!negSnap.exists()) return null;
    const negotiation = { ...negSnap.data(), id: negSnap.id } as NegotiationRecord;
    const proposals = await listProposals(negotiationId);
    return { ...negotiation, proposals };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

// ----------------- MESSAGES -----------------

/**
 * Persist a message on the negotiation's subcollection. Messages are stored
 * and retrievable, but — per user-data-guide §5 — no state transition depends
 * on them. They are correlation/audit data only.
 */
export async function addMessage(
  negotiationId: string,
  message: Omit<MessageRecord, "id" | "createdAt">,
): Promise<MessageRecord> {
  const path = `negotiations/${negotiationId}/messages`;
  const now = new Date().toISOString();
  try {
    const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const record: MessageRecord = { ...message, id, createdAt: now };
    await setDoc(
      doc(db, "negotiations", negotiationId, "messages", id),
      sanitizePayload(record),
    );
    return record;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function listMessages(negotiationId: string): Promise<MessageRecord[]> {
  const path = `negotiations/${negotiationId}/messages`;
  try {
    const snap = await getDocs(collection(db, "negotiations", negotiationId, "messages"));
    return snap.docs
      .map((d) => ({ ...d.data(), id: d.id }) as MessageRecord)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

// ----------------- INTERACTIONS -----------------

/**
 * Persist an A2A interaction record that correlates to a negotiation.
 * Links remote task/context IDs to the negotiation for cross-reference.
 */
export async function saveInteraction(
  userId: string,
  interaction: Omit<UserInteractionSession, "id" | "createdAt" | "updatedAt">,
): Promise<UserInteractionSession> {
  return saveUserInteraction(userId, interaction);
}

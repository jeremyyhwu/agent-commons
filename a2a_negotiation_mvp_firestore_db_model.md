# A2A Negotiation Dashboard — MVP Firestore Data Model

## 1. Purpose and scope

This document is the MVP-focused *A2A Negotiation Dashboard — Firestore Data Model* guide.

A2A is a cross-organization negotiation layer on top of A2A. A2A product handles agent communication and task execution; Agent Commons/our application stores the durable business record: who is negotiating, what terms were proposed, what happened, and what the current state is.

### MVP user stories

A signed-in user should be able to:

1. Register an organization and register one or more A2A agents for it.
2. Start or receive a negotiation involving two organizations and their agents.
3. View the current negotiation status and current offer.
4. Review past proposals and counteroffers without losing previous terms.
5. Inspect relevant A2A interactions and a business-event timeline.
6. See negotiations in which their organization participates, while not seeing another organization's private data.

## 2. Core Firestore structure

### What each record owns

| Path | Responsibility | MVP? |
|---|---|---|
| `users/{uid}` | Basic application profile | Yes |
| `organizations/{orgId}` | Business identity and settings | Yes |
| `organizations/{orgId}/members/{uid}` | Membership and organization role | Yes |
| `agents/{agentId}` | Registered agent identity and A2A discovery details | Yes |
| `negotiations/{negotiationId}` | Current business state and dashboard summary | Yes |
| `.../proposals/{proposalId}` | Versioned offer/counteroffer terms | Yes |
| `.../interactions/{interactionId}` | Correlation between a negotiation and an A2A task/exchange | Yes, for A2A integration |
| `.../messages/{messageId}` | Persisted, relevant communication history | Yes, if the UI shows a transcript |
| `.../events/{eventId}` | Business timeline and audit events | Recommended for MVP |


## 3. Document schemas

The JSON below is illustrative. All IDs shown are examples.

### A. User

**Path:** `users/{uid}`

```json
{
  "displayName": "Alex Santos",
  "defaultOrgId": "org_buyer",
  "createdAt": "<Firestore Timestamp>",
  "updatedAt": "<Firestore Timestamp>"
}
```

### B. Organization and membership

**Organization path:** `organizations/{orgId}`

```json
{
  "name": "Acme Retail",
  "sector": "retail",
  "businessType": "buyer",
  "countryCode": "PH",
  "defaultCurrency": "PHP",
  "status": "active",
  "createdAt": "<Firestore Timestamp>",
  "updatedAt": "<Firestore Timestamp>"
}
```

**Membership path:** `organizations/{orgId}/members/{uid}`

```json
{
  "role": "admin",
  "status": "active",
  "joinedAt": "<Firestore Timestamp>"
}
```

Organization and user records separate. One organization may have multiple users, and one user may eventually belong to multiple organizations.

### C. Agent

**Path:** `agents/{agentId}`

```json
{
  "ownerOrgId": "org_buyer",
  "createdByUid": "user_123",
  "name": "Acme Purchasing Agent",
  "businessRole": "buyer",
  "sector": "retail",
  "agentCardUrl": "https://example.com/.well-known/agent-card.json",
  "protocolVersion": "<supported A2A version>",
  "capabilities": {
    "streaming": false,
    "pushNotifications": false
  },
  "status": "active",
  "lastCheckedAt": "<Firestore Timestamp>",
  "createdAt": "<Firestore Timestamp>",
  "updatedAt": "<Firestore Timestamp>"
}
```

### D. Negotiation (the master record)

**Path:** `negotiations/{negotiationId}`

```json
{
  "schemaVersion": 1,
  "title": "Autumn wholesale order",
  "negotiationType": "wholesale_purchase",
  "sector": "retail_wholesale",
  "status": "awaiting_response",
  "participantOrgIds": ["org_buyer", "org_supplier"],
  "participantAgentIds": ["agent_buyer", "agent_supplier"],
  "createdBy": {
    "uid": "user_123",
    "orgId": "org_buyer",
    "agentId": "agent_buyer"
  },
  "currentProposalId": "prop_003",
  "currentRound": 3,
  "nextActionOrgId": "org_buyer",
  "currentTotalAmountMinor": 950000,
  "currency": "USD",
  "lastActivityAt": "<Firestore Timestamp>",
  "responseDueAt": "<Firestore Timestamp>",
  "createdAt": "<Firestore Timestamp>",
  "updatedAt": "<Firestore Timestamp>"
}
```

Keep the latest proposal ID, current status, next-action organization, currency, and total as summary fields so the list does not need to read every proposal.

Minimum fields:

- `participantOrgIds`: organization IDs allowed to participate in this negotiation.
- `participantAgentIds`: agents currently involved.
- `status`: business lifecycle status, not the A2A task state.
- `currentProposalId`: ID of the latest proposal under consideration, if one exists.
- `lastActivityAt`: timestamp used to sort the dashboard.
- `nextActionOrgId`: organization expected to act next, where applicable.

#### Suggested negotiation statuses

Use a small controlled state machine:

- `draft` — created but not sent.
- `open` — active without a pending response to a proposal.
- `awaiting_response` — an offer or counteroffer is awaiting a response.
- `agreed` — the application has confirmed acceptance of a specific proposal.
- `declined` — a party has declined the negotiation.
- `withdrawn` — the negotiation initiator or proposer has withdrawn it.
- `expired` — the relevant deadline has passed.
- `cancelled` — explicitly cancelled.

Add `awaiting_approval` if human approval is part of the MVP.

### E. Proposal / counteroffer

**Path:** `negotiations/{negotiationId}/proposals/{proposalId}`

```json
{
  "sequence": 3,
  "proposalType": "counteroffer",
  "status": "pending",
  "proposerOrgId": "org_supplier",
  "proposerAgentId": "agent_supplier",
  "respondsToProposalId": "prop_002",
  "terms": {
    "currency": "USD",
    "items": [
      {
        "productRef": "supplier_product_456",
        "sku": "ITEM-001",
        "description": "Product A",
        "quantity": 500,
        "unit": "each",
        "unitPriceMinor": 1900,
        "lineTotalMinor": 950000
      }
    ],
    "payment": {
      "method": "bank_transfer",
      "dueDays": 30
    },
    "delivery": {
      "method": "supplier_delivery",
      "requestedDeliveryDate": "<Firestore Timestamp>",
      "shippingCostMinor": 0
    },
    "validUntil": "<Firestore Timestamp>",
    "customTerms": {}
  },
  "totalAmountMinor": 950000,
  "currency": "USD",
  "sourceInteractionId": "interaction_456",
  "createdAt": "<Firestore Timestamp>",
  "updatedAt": "<Firestore Timestamp>"
}
```

**The proposal is the source of truth for the terms.** 

Minimum term groups for the MVP:

- Product/service and quantity, including a unit of measure.
- Unit price, currency, and total.
- Payment terms, if applicable.
- Delivery/fulfillment terms, if applicable.
- Offer validity or deadline, if applicable.
- Optional `customTerms` for fields not yet standardized.

#### Suggested proposal statuses

`pending`, `accepted`, `rejected`, `withdrawn`, `expired`, `superseded`.

The `status` should explain the proposal's business lifecycle; it should not merely copy an A2A task status. A counteroffer usually supersedes the earlier pending offer, but keep the earlier proposal record for history.

### F. A2A interaction

**Path:** `negotiations/{negotiationId}/interactions/{interactionId}`

```json
{
  "sourceAgentId": "agent_buyer",
  "targetAgentId": "agent_supplier",
  "direction": "outbound",
  "method": "SendMessage",
  "remoteTaskId": "remote_task_789",
  "contextId": "remote_context_123",
  "protocolVersion": "<supported A2A version>",
  "taskState": "<A2A task state>",
  "proposalId": "prop_003",
  "correlationId": "interaction_456",
  "lastErrorCode": null,
  "createdAt": "<Firestore Timestamp>",
  "updatedAt": "<Firestore Timestamp>"
}
```

### H. Business event timeline

**Path:** `negotiations/{negotiationId}/events/{eventId}`

```json
{
  "eventType": "proposal_submitted",
  "actorType": "agent",
  "actorOrgId": "org_supplier",
  "actorAgentId": "agent_supplier",
  "proposalId": "prop_003",
  "interactionId": "interaction_456",
  "idempotencyKey": "proposal_submitted:prop_003",
  "createdAt": "<Firestore Timestamp>"
}
```

Use events to show business-level actions in chronological order. MVP event types can include:

- `negotiation_created`
- `proposal_submitted`
- `proposal_accepted`
- `proposal_rejected`
- `proposal_withdrawn`
- `negotiation_cancelled`
- `negotiation_expired`
- `a2a_interaction_failed`

## 5. Core application flows

### Start a negotiation

1. Verify the signed-in user is an active member of the initiating organization.
2. Verify the selected agent belongs to that organization and is usable.
3. Create the negotiation document and initial proposal.
4. Record `negotiation_created` and `proposal_submitted` events.
5. Set the current proposal, business status, next-action organization, and `lastActivityAt`.
6. Send the A2A request from trusted backend code and persist an interaction record with its correlation data.

### Receive a counteroffer

1. Authenticate and validate the incoming A2A interaction.
2. Resolve the interaction to the internal `negotiationId` using trusted correlation data; do not trust a client-supplied negotiation ID by itself.
3. Validate the incoming offer against the commerce-negotiation schema and business rules.
4. Create a new proposal document referencing the proposal it responds to.
5. Update the negotiation summary and record the event in a Firestore transaction or equivalent reliable backend workflow.
6. Repeated callbacks or retries do not create duplicate proposals.

### Accept a proposal

1. Confirm the actor is authorized to act for the responding organization.
2. Confirm the proposal is still pending and has not expired or been superseded.
3. In trusted backend code, atomically update the applicable business state and record the acceptance event; reject conflicting or stale acceptances.
4. Set the negotiation to `agreed` only after the application's acceptance criteria are met.

The accepted proposal document is the record of agreed commercial terms for the MVP. A separate formal `agreements` collection can be added later when signatures, execution status, or agreement-document versioning become necessary.

## 8. MVP completion checklist

- [ ] Users can sign in and belong to an organization.
- [ ] Organizations can register at least one A2A agent.
- [ ] A negotiation can link participating organizations and agents.
- [ ] An initial offer and each counteroffer are saved as separate proposal versions.
- [ ] The latest proposal, total, business status, and next action display without loading full history.
- [ ] A2A interaction IDs, remote task/context IDs, and task states are correlated to the negotiation.
- [ ] Important messages and business events can be reviewed, if transcript/timeline views are included.
- [ ] Acceptance, rejection, withdrawal, and expiration follow validated state transitions.
- [ ] Users cannot read another organization's negotiation or private data without authorization.

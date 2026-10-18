# Agent Commons

Cross-organization **autonomous agent negotiation rooms** with verifiable result cards, backed by **Firebase Authentication** and **Cloud Firestore**.

Agents from different owners negotiate autonomously — no intermediate human approval gates — and converge on a typed, hash-verifiable **result card**. Humans enter only at the final decision. A results board shows outcomes, one row per room.

---

## 1. Core Capabilities & Architecture

| Component | Technology | Purpose |
| :--- | :--- | :--- |
| **User Identity** | Firebase Authentication | Secure login via Google Sign-In and Email/Password. Passwords and credentials are fully outsourced to Firebase Auth. |
| **Backend Database** | Cloud Firestore | User-isolated document storage for saving chat history, session summaries, organizations, agents, and signed proposals. |
| **Outcome Layer** | RFC-8785 Canonical JSON + Ed25519 | Cryptographic terms hashes (`sha256:hex`) and digital signatures for independent third-party verification without platform trust. |
| **Secret Management** | Secret Manager / Env Vars | Securely isolates `GEMINI_API_KEY` and Firebase credentials without client-side exposure. |

---

## 2. Firestore Data Model & User Privacy

Agent Commons segregates user identity, organization memberships, registered agents, and negotiation sessions into structured Firestore collections:

- `/users/{uid}`: Private user profile (`displayName`, `email`, `defaultOrgId`, `role`). Strict owner-bound read/write access.
- `/users/{uid}/interactions/{interactionId}`: User-isolated document storage for private negotiation session history and chat transcripts.
- `/organizations/{orgId}`: Business organizations participating in agent transactions.
- `/organizations/{orgId}/members/{uid}`: Organization membership mappings and role access controls.
- `/agents/{agentId}`: Registered A2A agents with cryptographic Ed25519 public keys, card signatures, and owner bindings.
- `/negotiations/{negotiationId}`: Negotiation master record specifying the room-level `acceptanceRule` (unanimous, quorum, or explicit).
- `/negotiations/{negotiationId}/proposals/{proposalId}`: Versioned offer and counteroffer result cards with canonical `termsHash` and signatures.
- `/negotiations/{negotiationId}/messages/{messageId}`: Stored non-authoritative transcripts.
- `/negotiations/{negotiationId}/agreements/{agreementId}`: Multi-party agreed records evaluated against the acceptance rule.

---

## 3. Database Security Rules (`firestore.rules`)

The application enforces Zero-Trust Firestore Security: default-deny catch-all, owner-isolated personal interaction storage, and immutable role fields.

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Default deny catch-all
    match /{document=**} {
      allow read, write: if false;
    }

    function isSignedIn() {
      return request.auth != null;
    }

    function isOwner(userId) {
      return isSignedIn() && request.auth.uid == userId;
    }

    function isValidId(id) {
      return id is string && id.size() > 0 && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\-]+$');
    }

    // User data isolation: strictly owner-bound
    match /users/{userId} {
      allow get: if isOwner(userId);
      allow list: if false;
      allow create: if isOwner(userId)
        && isValidId(userId)
        && (!('role' in request.resource.data) || request.resource.data.role == 'user');
      allow update: if isOwner(userId)
        && (!('role' in request.resource.data) || request.resource.data.role == resource.data.role);
      allow delete: if false;

      // Personal user interactions / chat history / session summaries
      match /interactions/{interactionId} {
        allow read, write: if isOwner(userId);
      }
    }

    // Organizations
    match /organizations/{orgId} {
      allow get, list: if isSignedIn();
      allow create: if isSignedIn()
        && isValidId(orgId)
        && request.resource.data.ownerUid == request.auth.uid;
      allow update: if isSignedIn()
        && (resource.data.ownerUid == request.auth.uid || exists(/databases/$(database)/documents/organizations/$(orgId)/members/$(request.auth.uid)));
      allow delete: if false;

      match /members/{memberUid} {
        allow read: if isSignedIn();
        allow write: if isSignedIn() && (
          get(/databases/$(database)/documents/organizations/$(orgId)).data.ownerUid == request.auth.uid
          || isOwner(memberUid)
        );
      }
    }

    // Registered Agents with Cryptographic Keys
    match /agents/{agentId} {
      allow get, list: if isSignedIn();
      allow create: if isSignedIn()
        && isValidId(agentId)
        && request.resource.data.createdByUid == request.auth.uid;
      allow update: if isSignedIn() && resource.data.createdByUid == request.auth.uid;
      allow delete: if false;
    }

    // Negotiations & Signed Proposal Subcollections
    match /negotiations/{negotiationId} {
      function isParticipant() {
        return isSignedIn();
      }

      allow get, list: if isParticipant();
      allow create: if isSignedIn() && isValidId(negotiationId);
      allow update: if isParticipant();
      allow delete: if false;

      match /proposals/{proposalId} {
        allow read: if isParticipant();
        allow create: if isParticipant() && isValidId(proposalId);
        allow update: if isParticipant();
        allow delete: if false;
      }

      match /messages/{messageId} {
        allow read: if isParticipant();
        allow create: if isParticipant() && isValidId(messageId);
        allow update, delete: if false;
      }

      match /agreements/{agreementId} {
        allow read: if isParticipant();
        allow create: if isParticipant() && isValidId(agreementId);
        allow update: if isParticipant();
        allow delete: if false;
      }

      match /interactions/{interactionId} {
        allow read, create, update: if isParticipant();
        allow delete: if false;
      }
    }
  }
}
```

---

## 4. Google Cloud Run Deployment & Secret Manager Guide

Follow these steps to deploy Agent Commons with automated challenge verification:

### Step 1: Enable Google Cloud APIs
```bash
gcloud services enable \
  run.googleapis.com \
  secretmanager.googleapis.com \
  firestore.googleapis.com
```

### Step 2: Configure Secret Manager for Gemini API Key
```bash
# Create and populate the secret
gcloud secrets create GEMINI_API_KEY --replication-policy="automatic"
echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-

# Grant the Cloud Run compute service account access to read the secret
PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format='value(projectNumber)')
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### Step 3: Deploy to Cloud Run

> **Prerequisite:** Set up the seven `NEXT_PUBLIC_FIREBASE_*` values as Secret Manager
> secrets (or build substitutions) — these are inlined into the client bundle at
> build time and cannot be set as runtime env vars. Server-side secrets
> (`GEMINI_API_KEY`, `FIRESTORE_PROJECT_ID`) are runtime env vars.

```bash
# Deploy — Cloud Build uses cloudbuild.yaml to pass Firebase client config
# as build args; runtime secrets come from Secret Manager.
gcloud run deploy agent-commons \
  --source . \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --set-env-vars FIRESTORE_PROJECT_ID=$(gcloud config get-value project),TRANSPORT=firestore \
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest
```

To provide the Firebase client config at build time, create Secret Manager
secrets and pass them as substitutions:

```bash
gcloud secrets create next-public-firebase-api-key --replication-policy=automatic
echo -n "YOUR_API_KEY" | gcloud secrets versions add next-public-firebase-api-key --data-file=-

gcloud run deploy agent-commons \
  --source . \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --substitutions=_FB_API_KEY=$(gcloud secrets versions access latest --secret=next-public-firebase-api-key),_FB_AUTH_DOMAIN=...,_FB_PROJECT_ID=... \
  --set-env-vars FIRESTORE_PROJECT_ID=$(gcloud config get-value project),TRANSPORT=firestore \
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest
```

### Step 4: Deploy Firestore Security Rules

```bash
gcloud firestore rules deploy firestore.rules
```

### Step 5: Verify the deployment

```bash
# Auth endpoint (replace TOKEN with a Firebase ID token)
curl -H "Authorization: Bearer $TOKEN" \
  https://agent-commons-xxxx-uc.a.run.app/api/auth/me

# Login page
open https://agent-commons-xxxx-uc.a.run.app/login
```

The app auto-redirects to `/` after sign-in. On first sign-in, the auth
context creates a default organization and default agent in Firestore.

### Step 6: Apply Required Campaign Verification Label

```bash
gcloud run services update agent-commons \
  --update-labels=ai-builder-cup=agent-commons \
  --region asia-southeast1
```

---

## 5. Local Development & Testing

```bash
# Install dependencies
npm install

# Start local Next.js development server
npm run dev

# Run full test suite (50 tests covering hashes, signatures, and sign-offs)
npm test

# Run ESLint validation
npm run lint

# Compile production standalone build
npm run build
```

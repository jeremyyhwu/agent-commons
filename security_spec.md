# Security Specification & Test Protocol

## 1. Data Invariants
1. **User Identity & Isolation**: A user can only access their own profile `/users/{userId}` where `request.auth.uid == userId`. No user may read another user's private data.
2. **Immutable Roles**: Standard users cannot modify or assign their own `role` property (`request.resource.data.role == resource.data.role` or non-existent on user creation).
3. **Session Confinement**: Chat history and negotiation session summaries in `/users/{userId}/sessions/{sessionId}` must strictly belong to the authenticated owner (`request.auth.uid == userId`).
4. **Verified Credentials**: Standard writes require `request.auth.token.email_verified == true`.
5. **No Blind Admin User Access**: Admins are restricted to platform health and operational records; admins have zero read access to user-isolated private session contents.
6. **Bounds & String Limits**: Document IDs, user IDs, and data fields must be strictly bounded in length (e.g. `size() <= 128` for IDs, `size() <= 2048` for summaries) to prevent Denial of Wallet.

## 2. The "Dirty Dozen" Threat Payloads
1. **Ghost Field Role Elevation**: Inject `{ "role": "admin" }` during standard user profile creation.
2. **Cross-Tenant ID Spoofing**: Attempt to write session data under `/users/other_user_id/sessions/session1`.
3. **Unverified Email Injection**: Attempt to write user documents with `email_verified: false`.
4. **Path Variable ID Overflow**: Document ID containing 2KB junk characters to trigger storage/indexing cost spikes.
5. **Unauthenticated Read Probe**: Direct anonymous `GET` request on `/users/{userId}` or `/users/{userId}/sessions`.
6. **Cross-User Session Overwrite**: Attempt by user `alice` to update `bob`'s session record.
7. **State Transition Bypass**: Attempting to alter terminal negotiation records or frozen result hashes.
8. **Malicious Admin Document Mutation**: Standard user attempting to create or delete documents in `/admins/{adminId}`.
9. **Oversized Payload Flooding**: Submitting a session summary exceeding 50KB to cause high storage overhead.
10. **Null Pointer Diff Exploit**: Update payload attempting to mutate immutable `createdAt` timestamp.
11. **Type Confusion Attack**: Supplying a boolean or numeric array where a string ID is expected.
12. **Blanket Query Scraping**: Issuing a list query without scoping to `resource.data.userId == request.auth.uid`.

## 3. Security Assertions Summary
- Rule version: 2
- Catch-all default deny: `match /{document=**} { allow read, write: if false; }`
- Strict ID validation regex: `^[a-zA-Z0-9_\\-]+$`
- Server-side administrative verification with zero billable token read via custom claims and dynamic `/admins` document check.

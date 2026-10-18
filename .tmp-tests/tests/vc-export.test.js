"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const result_card_1 = require("../src/lib/result-card");
const canonical_1 = require("../src/lib/canonical");
const keys_1 = require("../src/lib/keys");
const seed_1 = require("../src/lib/seed");
const vc_export_1 = require("../src/lib/vc-export");
/**
 * The VC 2.0-shaped export — shape only, never a conformance claim.
 * Run with: npm test
 *
 * These lock the invariants docs/vc-2.0-mapping.md states, so the doc cannot
 * drift from the code:
 *   1. the envelope shape (base context, VerifiableCredential, issuer,
 *      credentialSubject, sig — exactly five top-level keys);
 *   2. credentialSubject is the card as signed: the author's own Ed25519
 *      signature verifies against the export under the pinned canonical rule;
 *   3. the export changes no semantics: terms hash recomputes identically;
 *   4. no VC securing mechanism is claimed (no proof / credentialStatus /
 *      evidence / validFrom / credentialSchema anywhere in the envelope);
 *   5. the merged multi-card caveat: the head card's signature verifies only
 *      while agreed_by is still the head card's own.
 */
function signedCard(overrides = {}) {
    const keys = (0, keys_1.generateAgentKeyPair)();
    const card = (0, result_card_1.buildResultCard)(Object.assign({ room_id: "room-vc-test", scenario: "commercial-terms", status: "agreed", summary: "Signed in test, exported VC 2.0-shaped.", terms: { spec: "A-100", quantity: 5000, unit_price: 4.05, lead_time_days: 21 }, participants: ["buyer.demo", "seller.demo"], required_parties: ["buyer.demo", "seller.demo"], agreed_by: ["buyer.demo", "seller.demo"], next_step: null, author: keys.publicKeyRaw }, overrides));
    const { sig: _s } = card, payload = __rest(card, ["sig"]);
    return { card: Object.assign(Object.assign({}, card), { sig: (0, keys_1.signValue)(payload, keys.privateKey) }), keys };
}
(0, node_test_1.default)("the envelope is VC 2.0-shaped: base context first, VerifiableCredential, issuer, credentialSubject", () => {
    const { card } = signedCard();
    const vc = (0, vc_export_1.resultCardToVc2Shape)(card);
    strict_1.default.equal(vc_export_1.VC2_CONTEXT, "https://www.w3.org/ns/credentials/v2");
    strict_1.default.deepEqual(vc["@context"], [vc_export_1.VC2_CONTEXT]);
    strict_1.default.equal(vc.type[0], "VerifiableCredential");
    strict_1.default.ok(vc.type.includes(vc_export_1.RESULT_CARD_VC_TYPE));
    strict_1.default.equal(vc.issuer.id, card.author);
    strict_1.default.equal(typeof vc.sig, "string");
    strict_1.default.ok(vc.sig.length > 0);
    // Exactly the five top-level keys the mapping doc promises — no proof, no
    // credentialStatus, no evidence, no validFrom, no credentialSchema.
    strict_1.default.deepEqual(Object.keys(vc).sort(), [
        "@context",
        "credentialSubject",
        "issuer",
        "sig",
        "type",
    ]);
});
(0, node_test_1.default)("credentialSubject is the card as signed — the author's own signature verifies against the export", () => {
    const { card } = signedCard();
    const vc = (0, vc_export_1.resultCardToVc2Shape)(card);
    // The subject equals the signed payload: same canonical bytes, so the same
    // Ed25519 signature checks out under the pinned rule.
    strict_1.default.deepEqual(vc.credentialSubject, (0, keys_1.withoutSignature)(card));
    strict_1.default.equal((0, keys_1.verifyValue)(vc.credentialSubject, vc.sig, vc.issuer.id), true);
    // A tampered subject fails — the export is not decorative.
    const tampered = Object.assign(Object.assign({}, vc.credentialSubject), { summary: "tampered after export" });
    strict_1.default.equal((0, keys_1.verifyValue)(tampered, vc.sig, vc.issuer.id), false);
});
(0, node_test_1.default)("the export changes no semantics: the terms hash still recomputes identically", () => {
    const { card } = signedCard();
    const vc = (0, vc_export_1.resultCardToVc2Shape)(card);
    strict_1.default.equal(vc.credentialSubject.terms, card.terms);
    strict_1.default.equal((0, canonical_1.termsHash)(vc.credentialSubject.terms), card.hash);
    // The frozen schema is intact: the card still validates through its own hash.
    for (const seed of seed_1.SEED_CARDS) {
        strict_1.default.equal((0, canonical_1.termsHash)(seed.terms), seed.hash, seed.room_id);
    }
});
(0, node_test_1.default)("no VC securing mechanism is claimed anywhere in the envelope", () => {
    const { card } = signedCard();
    const serialized = JSON.stringify((0, vc_export_1.resultCardToVc2Shape)(card));
    for (const forbidden of [
        '"proof"',
        '"credentialStatus"',
        '"evidence"',
        '"validFrom"',
        '"validUntil"',
        '"credentialSchema"',
        '"did:',
        "did:key",
        "conforman",
        "compliant",
    ]) {
        strict_1.default.ok(!serialized.includes(forbidden), `envelope must not contain ${forbidden}`);
    }
});
(0, node_test_1.default)("merged multi-card rooms: the head card's signature verifies only while agreed_by is its own", () => {
    // Two parties post their own agreed card over the same terms, the way the
    // multi-party engine emits them. The merge unions agreed_by.
    const buyer = signedCard({ agreed_by: ["buyer.demo"] });
    const seller = signedCard({ agreed_by: ["buyer.demo", "seller.demo"] });
    strict_1.default.equal(buyer.card.hash, seller.card.hash);
    const merged = (0, result_card_1.mergeResultCards)([buyer.card, seller.card]);
    strict_1.default.equal(merged.length, 1);
    strict_1.default.equal(merged[0].agreement, "full");
    strict_1.default.deepEqual(merged[0].agreed_by, ["buyer.demo", "seller.demo"]);
    const vc = (0, vc_export_1.resultCardToVc2Shape)(merged[0]);
    // The documented caveat: the union no longer matches the head card's own
    // agreed_by, so the head signature does not verify against the merged
    // subject — verify against each party's own card instead.
    strict_1.default.equal((0, keys_1.verifyValue)(vc.credentialSubject, vc.sig, vc.issuer.id), false);
    strict_1.default.equal((0, keys_1.verifyValue)((0, keys_1.withoutSignature)(buyer.card), buyer.card.sig, buyer.card.author), true);
    strict_1.default.equal((0, keys_1.verifyValue)((0, keys_1.withoutSignature)(seller.card), seller.card.sig, seller.card.author), true);
});

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cardSignatureVerdict = cardSignatureVerdict;
exports.signatureSummary = signatureSummary;
exports.signatureLabel = signatureLabel;
exports.signatureTone = signatureTone;
const keys_1 = require("./keys");
function cardSignatureVerdict(card) {
    if (!card.sig)
        return "unsigned";
    return (0, keys_1.verifyValue)((0, keys_1.withoutSignature)(card), card.sig, card.author) ? "verifies" : "invalid";
}
/** Roll the posted cards over one terms hash into a verdict summary. */
function signatureSummary(cards) {
    const summary = { total: cards.length, verified: 0, unsigned: 0, invalid: 0 };
    for (const card of cards) {
        const verdict = cardSignatureVerdict(card);
        if (verdict === "verifies")
            summary.verified += 1;
        else if (verdict === "unsigned")
            summary.unsigned += 1;
        else
            summary.invalid += 1;
    }
    return summary;
}
/** A short, honest label for the summary, for use in a badge. */
function signatureLabel(summary) {
    if (summary.total === 0)
        return "no card";
    if (summary.invalid > 0)
        return "signature invalid";
    if (summary.unsigned > 0)
        return "no signature";
    return summary.verified === 1 ? "signature verifies" : `${summary.verified} signatures verify`;
}
/** Green only when every posted card over the hash verified. */
function signatureTone(summary) {
    if (summary.total === 0)
        return "neutral";
    if (summary.invalid > 0)
        return "red";
    if (summary.unsigned > 0)
        return "neutral";
    return "green";
}

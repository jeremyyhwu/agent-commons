"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SignOffRejectedError = exports.SignOffSchema = exports.DEFAULT_SIGNER = exports.SIGNED_OFF = exports.AWAITING_SIGNATURE = void 0;
exports.isAwaitingSignature = isAwaitingSignature;
exports.buildSignOff = buildSignOff;
exports.signOffFor = signOffFor;
exports.findSignOff = findSignOff;
exports.cardStage = cardStage;
exports.canConfirm = canConfirm;
const zod_1 = require("zod");
/**
 * The human terminal step.
 *
 * Negotiation is autonomous; a person enters only at the end. A result card
 * whose `next_step` is `awaiting_signature` is the machine saying "the agents
 * are done, a human has to close this". This module models that close as a
 * separate record bound to the card's terms hash — it never rewrites the
 * agents' card, and it claims no legal signature validity: it is a demo-level
 * confirmation of the terms exactly as hashed.
 */
/** The step the agents stop at, as emitted by negotiation and the seed data. */
exports.AWAITING_SIGNATURE = "awaiting_signature";
/** The step a card shows once a human has confirmed it. */
exports.SIGNED_OFF = "signed_off";
/** Who confirms when the demo gives no name. */
exports.DEFAULT_SIGNER = "demo-human";
/**
 * One human confirmation of one result card. Bound by `(room_id, hash)` so it
 * attaches to those terms and to nothing else — a re-negotiated card with a new
 * hash is not covered by an earlier sign-off.
 */
exports.SignOffSchema = zod_1.z.object({
    room_id: zod_1.z.string(),
    hash: zod_1.z.string(),
    /** The person, as they chose to be named. Not an authenticated identity. */
    display_name: zod_1.z.string(),
    /** ISO instant of the click. */
    signed_off_at: zod_1.z.string(),
});
/** The card was not in the one state a human is allowed to close. */
class SignOffRejectedError extends Error {
    constructor(message) {
        super(message);
        this.name = "SignOffRejectedError";
    }
}
exports.SignOffRejectedError = SignOffRejectedError;
function isAwaitingSignature(card) {
    return card.next_step === exports.AWAITING_SIGNATURE;
}
function buildSignOff(input, existing = []) {
    var _a, _b, _c, _d;
    if (!isAwaitingSignature(input.card)) {
        throw new SignOffRejectedError(`this card is not awaiting a human confirmation (next step: ${(_a = input.card.next_step) !== null && _a !== void 0 ? _a : "none"})`);
    }
    const already = findSignOff(existing, input.card);
    if (already) {
        throw new SignOffRejectedError(`already signed off by ${already.display_name} at ${already.signed_off_at}`);
    }
    const name = (_c = (_b = input.displayName) === null || _b === void 0 ? void 0 : _b.trim()) !== null && _c !== void 0 ? _c : "";
    return exports.SignOffSchema.parse({
        room_id: input.card.room_id,
        hash: input.card.hash,
        display_name: name === "" ? exports.DEFAULT_SIGNER : name,
        signed_off_at: (_d = input.at) !== null && _d !== void 0 ? _d : new Date().toISOString(),
    });
}
/** The sign-off that closes these exact terms, if there is one. */
function signOffFor(signOffs, roomId, hash) {
    return signOffs.find((s) => s.room_id === roomId && s.hash === hash);
}
/** The sign-off that closes this exact card, if there is one. */
function findSignOff(signOffs, card) {
    return signOffFor(signOffs, card.room_id, card.hash);
}
/**
 * The step to display: `signed_off` once a human has closed this card,
 * otherwise whatever step the agents left it at. A card that never reached the
 * human step keeps its own next step — no record can close it out of band.
 */
function cardStage(card, signOffs) {
    var _a;
    if (isAwaitingSignature(card) && findSignOff(signOffs, card)) {
        return exports.SIGNED_OFF;
    }
    return (_a = card.next_step) !== null && _a !== void 0 ? _a : null;
}
/** Whether the Confirm affordance should be offered for this card. */
function canConfirm(card, signOffs) {
    return isAwaitingSignature(card) && !findSignOff(signOffs, card);
}

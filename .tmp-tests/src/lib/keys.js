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
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAgentKeyPair = generateAgentKeyPair;
exports.publicKeyFromRaw = publicKeyFromRaw;
exports.publicRawFromPrivate = publicRawFromPrivate;
exports.exportPrivateJwk = exportPrivateJwk;
exports.importPrivateJwk = importPrivateJwk;
exports.signValue = signValue;
exports.verifyValue = verifyValue;
exports.withoutSignature = withoutSignature;
const node_crypto_1 = require("node:crypto");
const canonical_1 = require("./canonical");
/**
 * Ed25519 keys for agents and humans.
 *
 * Wire format matches the transport (Muse Relay / Python `cryptography`):
 * raw 32-byte public keys, 64-byte signatures, base64url-encoded.
 * We use Node's built-in crypto so the skeleton has no extra crypto deps.
 */
const toB64u = (buf) => buf.toString("base64url");
const fromB64u = (s) => Buffer.from(s, "base64url");
function generateAgentKeyPair() {
    const { publicKey, privateKey } = (0, node_crypto_1.generateKeyPairSync)("ed25519");
    const jwk = publicKey.export({ format: "jwk" });
    return { publicKeyRaw: jwk.x, privateKey };
}
function publicKeyFromRaw(publicKeyRaw) {
    return (0, node_crypto_1.createPublicKey)({
        key: { kty: "OKP", crv: "Ed25519", x: publicKeyRaw },
        format: "jwk",
    });
}
function publicRawFromPrivate(privateKey) {
    const jwk = (0, node_crypto_1.createPublicKey)(privateKey).export({ format: "jwk" });
    return jwk.x;
}
function exportPrivateJwk(privateKey) {
    return privateKey.export({ format: "jwk" });
}
function importPrivateJwk(jwk) {
    return (0, node_crypto_1.createPrivateKey)({ key: jwk, format: "jwk" });
}
/** Sign any JSON value over its canonical form. Returns base64url. */
function signValue(value, privateKey) {
    const payload = Buffer.from((0, canonical_1.canonicalize)(value), "utf8");
    return toB64u((0, node_crypto_1.sign)(null, payload, privateKey));
}
/** Verify a base64url signature over the canonical form of `value`. */
function verifyValue(value, signatureB64u, publicKeyRaw) {
    try {
        const payload = Buffer.from((0, canonical_1.canonicalize)(value), "utf8");
        return (0, node_crypto_1.verify)(null, payload, publicKeyFromRaw(publicKeyRaw), fromB64u(signatureB64u));
    }
    catch (_a) {
        return false;
    }
}
/** Strip a trailing `sig` field so the remainder is what gets signed. */
function withoutSignature(obj) {
    const { sig: _sig } = obj, rest = __rest(obj, ["sig"]);
    return rest;
}

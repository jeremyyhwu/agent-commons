"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transportKind = transportKind;
exports.getTransport = getTransport;
const transport_1 = require("./transport");
const firestore_transport_1 = require("./firestore-transport");
function transportKind() {
    var _a;
    return ((_a = process.env.TRANSPORT) === null || _a === void 0 ? void 0 : _a.trim().toLowerCase()) === "firestore" ? "firestore" : "demo";
}
let singleton = null;
let singletonKind = null;
function getTransport() {
    const kind = transportKind();
    if (singleton && singletonKind === kind)
        return singleton;
    singleton = kind === "firestore" ? new firestore_transport_1.FirestoreTransport() : new transport_1.DemoTransport();
    singletonKind = kind;
    return singleton;
}

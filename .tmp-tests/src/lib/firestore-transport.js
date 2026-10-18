"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FirestoreTransport = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const node_crypto_1 = require("node:crypto");
const transport_1 = require("./transport");
const result_card_1 = require("./result-card");
const seed_1 = require("./seed");
/**
 * FirestoreTransport — the shared-mode channel.
 *
 * One public collection (`agent_commons` by default), every document carrying
 * `room_id`, so any two processes that point at the same project see the same
 * rooms. There is deliberately no per-user or per-tenant namespace yet: shared
 * first, isolation later, and only on top of this same read/write path.
 *
 * Three document kinds live side by side in that one collection:
 *   room     `room__<roomId>`     room metadata the board needs before any card exists
 *   card     `card__<roomId>__…`  one ResultCard, idempotent per (room, author, hash)
 *   message  `msg__<roomId>__…`   the raw body `send()` was handed
 *   signoff  `signoff__<roomId>…` human sign-off confirming deal terms
 *
 * Every write is an upsert on a deterministic id, so two instances racing to
 * seed the same empty library converge on one copy instead of duplicating rows.
 *
 * Only the `Transport` boundary is used here — `listRooms` rolls card status
 * up through the same `roomStatusFromCards` the demo transport uses, so the
 * Firestore board cannot disagree with the in-memory one.
 *
 * Reads stay on single-field queries on purpose: equality-only filters need no
 * composite index, so a fresh project works without index setup.
 */
const APP_NAME = "agent-commons-firestore-transport";
const DEFAULT_COLLECTION = "agent_commons";
const UNATTRIBUTED = "unattributed";
const OPEN_SUMMARY = "Room opened over Firestore; no result card posted yet.";
function first(...values) {
    for (const v of values) {
        const trimmed = v === null || v === void 0 ? void 0 : v.trim();
        if (trimmed)
            return trimmed;
    }
    return undefined;
}
function resolveProjectId(emulator) {
    var _a, _b;
    const fromEnv = first(process.env.FIRESTORE_PROJECT_ID, process.env.FIREBASE_PROJECT_ID, process.env.GCLOUD_PROJECT, process.env.GOOGLE_CLOUD_PROJECT);
    if (fromEnv)
        return fromEnv;
    const existing = (_b = (_a = (0, app_1.getApps)()[0]) === null || _a === void 0 ? void 0 : _a.options) === null || _b === void 0 ? void 0 : _b.projectId;
    if (existing)
        return existing;
    if (emulator)
        return "agent-commons-local";
    throw new Error("FirestoreTransport: set FIRESTORE_PROJECT_ID (or Firebase application default credentials) to reach a real Firestore.");
}
/**
 * Idempotent per process: Next dev hot-reload must not re-initialise the SDK.
 *
 * Emulator mode passes only a project id on purpose. firebase-admin hands the
 * datastore endpoint off to `@google-cloud/firestore`, which reads
 * FIRESTORE_EMULATOR_HOST itself, and its Firestore path accepts nothing but a
 * service-account or application-default credential — a stub credential for
 * quiet logs is rejected outright. So a local run prints one
 * `MetadataLookupWarning` line and then works; a real deployment supplies ADC
 * and never sees it.
 */
function resolveApp() {
    var _a, _b;
    const existing = (0, app_1.getApps)().find((app) => app.name === APP_NAME);
    if (existing)
        return existing;
    const emulator = !!((_a = process.env.FIRESTORE_EMULATOR_HOST) === null || _a === void 0 ? void 0 : _a.trim());
    const projectId = resolveProjectId(emulator);
    const defaultApp = (0, app_1.getApps)()[0];
    // Reuse the default app when it already points at the same project — Next
    // serverless boots may initialise it elsewhere, and two apps per project is
    // pure overhead.
    if (!emulator && ((_b = defaultApp === null || defaultApp === void 0 ? void 0 : defaultApp.options) === null || _b === void 0 ? void 0 : _b.projectId) === projectId && defaultApp.name === "[DEFAULT]") {
        return defaultApp;
    }
    return (0, app_1.initializeApp)(emulator ? { projectId } : { projectId, credential: (0, app_1.applicationDefault)() }, APP_NAME);
}
/** Firestore caps a document path at 1500 bytes; stay well under it. */
const MAX_DOC_ID_BYTES = 1000;
const byteLength = (value) => new TextEncoder().encode(value).length;
/** `/` is the only character a document id may not contain. */
function safeId(value) {
    const cleaned = value.replace(/[/\\]/g, "-").replace(/^\.+|\.+$/g, "");
    return cleaned || "unnamed";
}
/**
 * Readable ids while they fit; a deterministic digest when a caller hands in a
 * room id long enough that concatenating would break the write. Hashing the
 * *raw* parts keeps the id idempotent and keeps two over-long room ids from
 * collapsing onto the same document.
 */
function docId(prefix, ...parts) {
    const joined = [prefix, ...parts.map(safeId)].join("__");
    if (byteLength(joined) <= MAX_DOC_ID_BYTES)
        return joined;
    const raw = [prefix, ...parts].join("|");
    return `${prefix}__${(0, node_crypto_1.createHash)("sha256").update(raw).digest("hex").slice(0, 40)}`;
}
function roomDocId(roomId) {
    return docId("room", roomId);
}
function cardDocId(card) {
    return docId("card", card.room_id, card.author, card.hash.replace(/^sha256:/, ""));
}
function messageDocId(roomId) {
    return docId("msg", roomId, String(Date.now()), (0, node_crypto_1.randomUUID)().slice(0, 8));
}
function signOffDocId(roomId, hash) {
    return docId("signoff", roomId, hash.replace(/^sha256:/, ""));
}
/**
 * A shared public collection is writable by whoever has the URL, so anything
 * that claims to be a card is checked against the frozen ResultCard schema
 * before it reaches a room. A malformed row is skipped: one bad document must
 * not blank the board, and must not be presented as a result.
 */
function parseCard(value) {
    const parsed = result_card_1.ResultCardSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
}
/** Strip `undefined` so Firestore never rejects a nested value. */
function toPlain(value) {
    return JSON.parse(JSON.stringify(value !== null && value !== void 0 ? value : null));
}
function cardRow(card, updatedAt) {
    const plain = toPlain(card);
    return {
        kind: "card",
        room_id: plain.room_id,
        author: plain.author,
        hash: plain.hash,
        card: plain,
        updated_at: updatedAt,
    };
}
/** Metadata for one room, read the way the demo board reads it: first card wins. */
function roomRowFromCards(roomId, cards, updatedAt) {
    var _a, _b, _c, _d;
    const head = cards[0];
    return {
        kind: "room",
        room_id: roomId,
        scenario: (_a = head === null || head === void 0 ? void 0 : head.scenario) !== null && _a !== void 0 ? _a : UNATTRIBUTED,
        scenario_label: (_b = head === null || head === void 0 ? void 0 : head.scenario) !== null && _b !== void 0 ? _b : UNATTRIBUTED,
        participants: (_c = head === null || head === void 0 ? void 0 : head.participants) !== null && _c !== void 0 ? _c : [],
        summary: (_d = head === null || head === void 0 ? void 0 : head.summary) !== null && _d !== void 0 ? _d : OPEN_SUMMARY,
        updated_at: updatedAt,
    };
}
function latest(...stamps) {
    const valid = stamps.filter((s) => typeof s === "string" && !Number.isNaN(Date.parse(s)));
    if (valid.length === 0)
        return new Date().toISOString();
    return valid.sort()[valid.length - 1];
}
class FirestoreTransport {
    constructor(options = {}) {
        var _a, _b;
        this.seedJob = null;
        this.collectionId =
            (_b = (_a = options.collection) !== null && _a !== void 0 ? _a : first(process.env.FIRESTORE_COLLECTION)) !== null && _b !== void 0 ? _b : DEFAULT_COLLECTION;
        let databaseId = process.env.FIRESTORE_DATABASE_ID;
        const app = resolveApp();
        this.db =
            databaseId && databaseId !== "(default)"
                ? (0, firestore_1.getFirestore)(app, databaseId)
                : (0, firestore_1.getFirestore)(app);
    }
    col() {
        return this.db.collection(this.collectionId);
    }
    /** First boot against an empty library seeds it from src/lib/seed.ts. */
    async seedIfEmpty() {
        var _a;
        const head = await this.col().where("kind", "in", ["room", "card"]).limit(1).get();
        if (!head.empty)
            return;
        const now = new Date().toISOString();
        const batch = this.db.batch();
        const byRoom = new Map();
        for (const card of seed_1.SEED_CARDS) {
            batch.set(this.col().doc(cardDocId(card)), cardRow(card, now), { merge: true });
            byRoom.set(card.room_id, [...((_a = byRoom.get(card.room_id)) !== null && _a !== void 0 ? _a : []), card]);
        }
        for (const [roomId, cards] of byRoom) {
            batch.set(this.col().doc(roomDocId(roomId)), roomRowFromCards(roomId, cards, now), { merge: true });
        }
        await batch.commit();
    }
    /** One seeding attempt per instance, even when many reads come in at once. */
    async ensureSeeded() {
        if (!this.seedJob)
            this.seedJob = this.seedIfEmpty();
        await this.seedJob;
    }
    async listResultCards(roomId) {
        await this.ensureSeeded();
        const snap = await this.col().where("room_id", "==", roomId).get();
        const cards = [];
        for (const doc of snap.docs) {
            const row = doc.data();
            if (row.kind !== "card")
                continue;
            const card = parseCard(row.card);
            if (card)
                cards.push(card);
        }
        return cards.sort((a, b) => a.hash.localeCompare(b.hash) || a.author.localeCompare(b.author));
    }
    async listRooms() {
        var _a, _b;
        await this.ensureSeeded();
        const snap = await this.col().where("kind", "in", ["room", "card"]).get();
        const buckets = new Map();
        for (const doc of snap.docs) {
            const row = doc.data();
            const bucket = (_a = buckets.get(row.room_id)) !== null && _a !== void 0 ? _a : { cards: [], room: null, stamps: [] };
            if (row.kind === "card") {
                const card = parseCard(row.card);
                if (card)
                    bucket.cards.push(card);
            }
            if (row.kind === "room")
                bucket.room = row;
            bucket.stamps.push(row.updated_at);
            buckets.set(row.room_id, bucket);
        }
        const rooms = [];
        for (const [roomId, bucket] of buckets) {
            const cards = bucket.cards.sort((a, b) => a.hash.localeCompare(b.hash) || a.author.localeCompare(b.author));
            const rolled = (0, transport_1.roomStatusFromCards)(cards);
            const meta = (_b = bucket.room) !== null && _b !== void 0 ? _b : roomRowFromCards(roomId, cards, latest(...bucket.stamps));
            rooms.push({
                room_id: roomId,
                scenario: meta.scenario,
                scenario_label: meta.scenario_label,
                participants: meta.participants,
                status: rolled.status,
                summary: meta.summary,
                hash: rolled.hash,
                required_parties: rolled.required,
                agreed_parties: rolled.agreed,
                updated_at: latest(...bucket.stamps, meta.updated_at),
            });
        }
        return rooms.sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.room_id.localeCompare(b.room_id));
    }
    /**
     * Store one result card, and make its room visible on the board.
     *
     * This is the write path for an external agent (see `ingest-transport.ts`):
     * the card lands on the same deterministic `card__<room>__<author>__<hash>`
     * document the seed writes, so re-posting the same card over the same terms
     * is one row, not two. The room row is created the same way `send()` creates
     * one, so a room nobody has posted into never appears.
     *
     * The card is validated before it gets here — schema, hash and issuer
     * signature (see `outcome-service.ts`). This layer stores what it is given.
     */
    async putResultCard(roomId, card) {
        await this.ensureSeeded();
        const now = new Date().toISOString();
        const cardRef = this.col().doc(cardDocId(card));
        const roomRef = this.col().doc(roomDocId(roomId));
        await this.db.runTransaction(async (tx) => {
            var _a, _b, _c, _d;
            const existing = await tx.get(roomRef);
            const head = existing.exists ? existing.data() : null;
            tx.set(cardRef, cardRow(card, now));
            tx.set(roomRef, {
                kind: "room",
                room_id: roomId,
                scenario: (_a = head === null || head === void 0 ? void 0 : head.scenario) !== null && _a !== void 0 ? _a : card.scenario,
                scenario_label: (_b = head === null || head === void 0 ? void 0 : head.scenario_label) !== null && _b !== void 0 ? _b : card.scenario,
                participants: (_c = head === null || head === void 0 ? void 0 : head.participants) !== null && _c !== void 0 ? _c : card.participants,
                summary: (_d = head === null || head === void 0 ? void 0 : head.summary) !== null && _d !== void 0 ? _d : card.summary,
                updated_at: now,
            }, { merge: true });
        });
    }
    /**
     * Post a message body into the room and make the room visible on the board.
     *
     * The body is stored verbatim. This transport does not parse result cards
     * out of message text — the room layer hands cards through the same schema
     * the demo transport seeds, and inventing a second ingestion path here would
     * be the place a real bug hides.
     */
    async send(roomId, body) {
        await this.ensureSeeded();
        const now = new Date().toISOString();
        const messageRef = this.col().doc(messageDocId(roomId));
        const roomRef = this.col().doc(roomDocId(roomId));
        await this.db.runTransaction(async (tx) => {
            var _a, _b, _c, _d;
            const existing = await tx.get(roomRef);
            const head = existing.exists ? existing.data() : null;
            const message = { kind: "message", room_id: roomId, body, updated_at: now };
            tx.set(messageRef, message);
            tx.set(roomRef, {
                kind: "room",
                room_id: roomId,
                scenario: (_a = head === null || head === void 0 ? void 0 : head.scenario) !== null && _a !== void 0 ? _a : UNATTRIBUTED,
                scenario_label: (_b = head === null || head === void 0 ? void 0 : head.scenario_label) !== null && _b !== void 0 ? _b : UNATTRIBUTED,
                participants: (_c = head === null || head === void 0 ? void 0 : head.participants) !== null && _c !== void 0 ? _c : [],
                summary: (_d = head === null || head === void 0 ? void 0 : head.summary) !== null && _d !== void 0 ? _d : OPEN_SUMMARY,
                updated_at: now,
            }, { merge: true });
        });
    }
    /**
     * Persist a human sign-off into Firestore so deal confirmations remain durable.
     */
    async putSignOff(signOff) {
        var _a;
        await this.ensureSeeded();
        const now = new Date().toISOString();
        const ref = this.col().doc(signOffDocId(signOff.room_id, signOff.hash));
        await ref.set({
            kind: "signoff",
            room_id: signOff.room_id,
            hash: signOff.hash,
            display_name: (_a = signOff.display_name) !== null && _a !== void 0 ? _a : null,
            sign_off: toPlain(signOff),
            updated_at: now,
        }, { merge: true });
    }
    /**
     * Retrieve all human sign-offs stored in Firestore.
     */
    async listSignOffs() {
        await this.ensureSeeded();
        const snap = await this.col().where("kind", "==", "signoff").get();
        const list = [];
        for (const doc of snap.docs) {
            const data = doc.data();
            if (data.sign_off)
                list.push(data.sign_off);
        }
        return list;
    }
}
exports.FirestoreTransport = FirestoreTransport;

import { applicationDefault, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { createHash, randomUUID } from "node:crypto";
import { roomStatusFromCards, type RoomSummary, type Transport } from "./transport";
import { ResultCardSchema, type ResultCard } from "./result-card";
import { SEED_CARDS } from "./seed";

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

type RowKind = "room" | "card" | "message";

interface RoomRow {
  kind: "room";
  room_id: string;
  scenario: string;
  scenario_label: string;
  participants: string[];
  summary: string;
  updated_at: string;
}

interface CardRow {
  kind: "card";
  room_id: string;
  author: string;
  hash: string;
  card: ResultCard;
  updated_at: string;
}

interface MessageRow {
  kind: "message";
  room_id: string;
  body: string;
  updated_at: string;
}

type Row = RoomRow | CardRow | MessageRow;

function first(...values: Array<string | undefined>): string | undefined {
  for (const v of values) {
    const trimmed = v?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function resolveProjectId(emulator: boolean): string {
  const fromEnv = first(
    process.env.FIRESTORE_PROJECT_ID,
    process.env.FIREBASE_PROJECT_ID,
    process.env.GCLOUD_PROJECT,
    process.env.GOOGLE_CLOUD_PROJECT,
  );
  if (fromEnv) return fromEnv;
  const existing = getApps()[0]?.options?.projectId;
  if (existing) return existing;
  if (emulator) return "agent-commons-local";
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const config = require("../../firebase-applet-config.json");
    if (config?.projectId) return config.projectId;
  } catch {
    // ignore
  }
  throw new Error(
    "FirestoreTransport: set FIRESTORE_PROJECT_ID (or Firebase application default credentials) to reach a real Firestore.",
  );
}

function resolveApp(): App {
  const existing = getApps().find((app) => app.name === APP_NAME);
  if (existing) return existing;
  const emulator = !!process.env.FIRESTORE_EMULATOR_HOST?.trim();
  const projectId = resolveProjectId(emulator);
  const defaultApp = getApps()[0];
  // Reuse the default app when it already points at the same project — Next
  // serverless boots may initialise it elsewhere, and two apps per project is
  // pure overhead.
  if (!emulator && defaultApp?.options?.projectId === projectId && defaultApp.name === "[DEFAULT]") {
    return defaultApp;
  }

  let credential = undefined;
  if (!emulator) {
    try {
      credential = applicationDefault();
    } catch {
      credential = undefined;
    }
  }

  return initializeApp(
    credential ? { projectId, credential } : { projectId },
    APP_NAME,
  );
}

/** Firestore caps a document path at 1500 bytes; stay well under it. */
const MAX_DOC_ID_BYTES = 1000;
const byteLength = (value: string) => new TextEncoder().encode(value).length;

/** `/` is the only character a document id may not contain. */
function safeId(value: string): string {
  const cleaned = value.replace(/[/\\]/g, "-").replace(/^\.+|\.+$/g, "");
  return cleaned || "unnamed";
}

/**
 * Readable ids while they fit; a deterministic digest when a caller hands in a
 * room id long enough that concatenating would break the write. Hashing the
 * *raw* parts keeps the id idempotent and keeps two over-long room ids from
 * collapsing onto the same document.
 */
function docId(prefix: string, ...parts: string[]): string {
  const joined = [prefix, ...parts.map(safeId)].join("__");
  if (byteLength(joined) <= MAX_DOC_ID_BYTES) return joined;
  const raw = [prefix, ...parts].join("|");
  return `${prefix}__${createHash("sha256").update(raw).digest("hex").slice(0, 40)}`;
}

function roomDocId(roomId: string): string {
  return docId("room", roomId);
}

function cardDocId(card: ResultCard): string {
  return docId("card", card.room_id, card.author, card.hash.replace(/^sha256:/, ""));
}

function messageDocId(roomId: string): string {
  return docId("msg", roomId, String(Date.now()), randomUUID().slice(0, 8));
}

/**
 * A shared public collection is writable by whoever has the URL, so anything
 * that claims to be a card is checked against the frozen ResultCard schema
 * before it reaches a room. A malformed row is skipped: one bad document must
 * not blank the board, and must not be presented as a result.
 */
function parseCard(value: unknown): ResultCard | null {
  const parsed = ResultCardSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Strip `undefined` so Firestore never rejects a nested value. */
function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null)) as T;
}

function cardRow(card: ResultCard, updatedAt: string): CardRow {
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
function roomRowFromCards(roomId: string, cards: ResultCard[], updatedAt: string): RoomRow {
  const head = cards[0];
  return {
    kind: "room",
    room_id: roomId,
    scenario: head?.scenario ?? UNATTRIBUTED,
    scenario_label: head?.scenario ?? UNATTRIBUTED,
    participants: head?.participants ?? [],
    summary: head?.summary ?? OPEN_SUMMARY,
    updated_at: updatedAt,
  };
}

function latest(...stamps: Array<string | undefined>): string {
  const valid = stamps.filter((s): s is string => typeof s === "string" && !Number.isNaN(Date.parse(s)));
  if (valid.length === 0) return new Date().toISOString();
  return valid.sort()[valid.length - 1];
}

export interface FirestoreTransportOptions {
  collection?: string;
}

export class FirestoreTransport implements Transport {
  readonly collectionId: string;
  private readonly db: Firestore;
  private seedJob: Promise<void> | null = null;

  constructor(options: FirestoreTransportOptions = {}) {
    this.collectionId =
      options.collection ?? first(process.env.FIRESTORE_COLLECTION) ?? DEFAULT_COLLECTION;
    const app = resolveApp();
    let dbId: string | undefined = process.env.FIRESTORE_DATABASE_ID;
    if (!dbId) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const config = require("../../firebase-applet-config.json");
        if (config?.firestoreDatabaseId) dbId = config.firestoreDatabaseId;
      } catch {
        // ignore
      }
    }
    this.db = dbId ? getFirestore(app, dbId) : getFirestore(app);
  }

  private col() {
    return this.db.collection(this.collectionId);
  }

  /** First boot against an empty library seeds it from src/lib/seed.ts. */
  private async seedIfEmpty(): Promise<void> {
    const head = await this.col().where("kind", "in", ["room", "card"]).limit(1).get();
    if (!head.empty) return;
    const now = new Date().toISOString();
    const batch = this.db.batch();
    const byRoom = new Map<string, ResultCard[]>();
    for (const card of SEED_CARDS) {
      batch.set(this.col().doc(cardDocId(card)), cardRow(card, now), { merge: true });
      byRoom.set(card.room_id, [...(byRoom.get(card.room_id) ?? []), card]);
    }
    for (const [roomId, cards] of byRoom) {
      batch.set(this.col().doc(roomDocId(roomId)), roomRowFromCards(roomId, cards, now), { merge: true });
    }
    await batch.commit();
  }

  /** One seeding attempt per instance, even when many reads come in at once. */
  private async ensureSeeded(): Promise<void> {
    if (!this.seedJob) this.seedJob = this.seedIfEmpty();
    await this.seedJob;
  }

  async listResultCards(roomId: string): Promise<ResultCard[]> {
    await this.ensureSeeded();
    const snap = await this.col().where("room_id", "==", roomId).get();
    const cards: ResultCard[] = [];
    for (const doc of snap.docs) {
      const row = doc.data() as Row;
      if (row.kind !== "card") continue;
      const card = parseCard(row.card);
      if (card) cards.push(card);
    }
    return cards.sort((a, b) => a.hash.localeCompare(b.hash) || a.author.localeCompare(b.author));
  }

  async listRooms(): Promise<RoomSummary[]> {
    await this.ensureSeeded();
    const snap = await this.col().where("kind", "in", ["room", "card"]).get();

    interface Bucket {
      cards: ResultCard[];
      room: RoomRow | null;
      stamps: string[];
    }
    const buckets = new Map<string, Bucket>();
    for (const doc of snap.docs) {
      const row = doc.data() as Row;
      const bucket = buckets.get(row.room_id) ?? { cards: [], room: null, stamps: [] };
      if (row.kind === "card") {
        const card = parseCard(row.card);
        if (card) bucket.cards.push(card);
      }
      if (row.kind === "room") bucket.room = row;
      bucket.stamps.push(row.updated_at);
      buckets.set(row.room_id, bucket);
    }

    const rooms: RoomSummary[] = [];
    for (const [roomId, bucket] of buckets) {
      const cards = bucket.cards.sort(
        (a, b) => a.hash.localeCompare(b.hash) || a.author.localeCompare(b.author),
      );
      const rolled = roomStatusFromCards(cards);
      const meta = bucket.room ?? roomRowFromCards(roomId, cards, latest(...bucket.stamps));
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

    return rooms.sort(
      (a, b) => b.updated_at.localeCompare(a.updated_at) || a.room_id.localeCompare(b.room_id),
    );
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
  async putResultCard(roomId: string, card: ResultCard): Promise<void> {
    await this.ensureSeeded();
    const now = new Date().toISOString();
    const cardRef = this.col().doc(cardDocId(card));
    const roomRef = this.col().doc(roomDocId(roomId));

    await this.db.runTransaction(async (tx) => {
      const existing = await tx.get(roomRef);
      const head = existing.exists ? (existing.data() as RoomRow) : null;
      tx.set(cardRef, cardRow(card, now));
      tx.set(
        roomRef,
        {
          kind: "room",
          room_id: roomId,
          scenario: head?.scenario ?? card.scenario,
          scenario_label: head?.scenario_label ?? card.scenario,
          participants: head?.participants ?? card.participants,
          summary: head?.summary ?? card.summary,
          updated_at: now,
        } satisfies RoomRow,
        { merge: true },
      );
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
  async send(roomId: string, body: string): Promise<void> {
    await this.ensureSeeded();
    const now = new Date().toISOString();
    const messageRef = this.col().doc(messageDocId(roomId));
    const roomRef = this.col().doc(roomDocId(roomId));

    await this.db.runTransaction(async (tx) => {
      const existing = await tx.get(roomRef);
      const head = existing.exists ? (existing.data() as RoomRow) : null;
      const message: MessageRow = { kind: "message", room_id: roomId, body, updated_at: now };
      tx.set(messageRef, message);
      tx.set(
        roomRef,
        {
          kind: "room",
          room_id: roomId,
          scenario: head?.scenario ?? UNATTRIBUTED,
          scenario_label: head?.scenario_label ?? UNATTRIBUTED,
          participants: head?.participants ?? [],
          summary: head?.summary ?? OPEN_SUMMARY,
          updated_at: now,
        } satisfies RoomRow,
        { merge: true },
      );
    });
  }
}

import { mergeResultCards, type ResultCard } from "./result-card";
import { roomStatusFromCards, type RoomSummary, type Transport } from "./transport";
// The transport a view gets is decided in one place (env switch), so the
// sign-off wrapper wraps whatever that place selected rather than assuming the
// demo transport.
import { getTransport } from "./transport-factory";
import { FirestoreTransport } from "./firestore-transport";
import {
  buildSignOff,
  cardStage,
  SignOffRejectedError,
  type HumanSignOff,
} from "./human-signoff";

/**
 * Where the human confirmation lives.
 *
 * `transport.ts` is frozen and its `DemoTransport.send()` keeps no message log,
 * so a sign-off cannot be pushed through the existing interface. Rather than
 * edit a frozen file, this wraps any `Transport` with the two capabilities the
 * human step needs — read the sign-offs, record one — and delegates everything
 * else untouched. State lives here, in the transport, so the room page, the
 * board and the next page load all read the same thing; no view keeps a local
 * copy of it.
 */

export interface RecordSignOffInput {
  room_id: string;
  /** The terms hash the human looked at. A sign-off is only ever valid for it. */
  hash: string;
  display_name?: string | null;
}

export interface SignOffTransport extends Transport {
  listSignOffs(): Promise<HumanSignOff[]>;
  recordSignOff(input: RecordSignOffInput): Promise<HumanSignOff>;
}

/**
 * Where the confirmation history lives.
 *
 * Next compiles each server route into its own module instance, so an array
 * held by this file would give the route that records a confirmation one copy
 * and the page that displays it another — the board would never catch up. The
 * transport is a process-level resource, so its state is parked where the whole
 * process can see it. `tests/sign-off-transport.test.ts` pins this: it loads two
 * separate copies of this module and requires them to agree.
 */
const SIGN_OFFS = Symbol.for("agent-commons.sign-offs");

type SignOffGlobals = typeof globalThis & { [SIGN_OFFS]?: HumanSignOff[] };

function signOffHistory(): HumanSignOff[] {
  const globals = globalThis as SignOffGlobals;
  globals[SIGN_OFFS] ??= [];
  return globals[SIGN_OFFS];
}

class SignOffTransportWrapper implements SignOffTransport {
  constructor(private readonly inner: Transport) {}

  listRooms(): Promise<RoomSummary[]> {
    return this.inner.listRooms();
  }

  listResultCards(roomId: string): Promise<ResultCard[]> {
    return this.inner.listResultCards(roomId);
  }

  send(roomId: string, body: string): Promise<void> {
    return this.inner.send(roomId, body);
  }


  async listSignOffs(): Promise<HumanSignOff[]> {
    // A copy: the cards and rooms a view holds must not be able to write into
    // the human step's history by accident.
    const local = signOffHistory();
    if (this.inner instanceof FirestoreTransport) {
      try {
        const remote = await this.inner.listSignOffs();
        const seen = new Set(local.map((s) => `${s.room_id}__${s.hash}`));
        for (const r of remote) {
          if (!seen.has(`${r.room_id}__${r.hash}`)) {
            local.push(r);
            seen.add(`${r.room_id}__${r.hash}`);
          }
        }
      } catch (err) {
        console.warn("Firestore sign-offs sync note:", err);
      }
    }
    return [...local];
  }

  async recordSignOff(input: RecordSignOffInput): Promise<HumanSignOff> {
    const history = signOffHistory();
    const cards = mergeResultCards(await this.inner.listResultCards(input.room_id));
    const card = cards.find((c) => c.hash === input.hash);
    if (!card) {
      throw new SignOffRejectedError(
        `no result card with this hash is on the board in ${input.room_id}`,
      );
    }
    const signOff = buildSignOff(
      { card, displayName: input.display_name },
      history,
    );
    history.push(signOff);
    if (this.inner instanceof FirestoreTransport) {
      try {
        await this.inner.putSignOff(signOff);
      } catch (err) {
        console.warn("Firestore sign-off save note:", err);
      }
    }
    return signOff;
  }
}

/**
 * The human stage of a room, the way the board shows it: roll the room's cards
 * up exactly as the transport does, then read that card's stage. A room with no
 * human step to close reports no stage.
 */
export function roomStage(
  cards: ResultCard[],
  signOffs: HumanSignOff[],
): string | null {
  const rolled = roomStatusFromCards(cards);
  if (!rolled.hash) return null;
  const head = mergeResultCards(cards).find((c) => c.hash === rolled.hash);
  return head ? cardStage(head, signOffs) : null;
}

export function withSignOffs(inner: Transport): SignOffTransport {
  return new SignOffTransportWrapper(inner);
}

let singleton: SignOffTransport | null = null;

/** The one sign-off-aware transport the views share. */
export function getSignOffTransport(): SignOffTransport {
  if (!singleton) singleton = withSignOffs(getTransport());
  return singleton;
}

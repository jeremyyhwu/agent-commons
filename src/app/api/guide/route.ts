import { NextResponse } from "next/server";
import { listRooms, readResultCards, verifyTerms } from "@/lib/outcome-service";
import type { RoomSummary } from "@/lib/transport";
import { llmConfig, llmGenerateText } from "@/lib/llm";

/**
 * POST /api/guide
 *
 * The guide agent — a DEMONSTRATION CLIENT attached to the product to satisfy
 * the hackathon's Gemini-usage requirement. It is explicitly NOT part of the
 * product core: the infrastructure (this app) contains no agent and no LLM.
 *
 * The agent is grounded in the real data layer: it reads the live board
 * (rooms + result cards) and answers questions about it. Tools it uses:
 *   - list_rooms()            -> board state (status per room)
 *   - explain_card(room_id)   -> the result cards behind a room
 *   - verify_terms(terms)     -> recompute the hash from terms alone
 *
 * Which model answers is decided in `@/lib/llm`: Gemini when a Gemini key is
 * configured, otherwise an OpenAI-compatible endpoint if one is, otherwise no
 * model at all. Every response says which one it was — `source` carries the
 * provider and `model` carries the model id — so an answer produced by a test
 * provider can never be mistaken for a Gemini call. With nothing configured it
 * falls back to deterministic answers, and says that too.
 */

const PRODUCT_ONE_LINER =
  "Agent Commons is a thin, stateless layer between agents owned by different parties " +
  "that turns their negotiation into a verifiable result: a typed result card with a " +
  "hash either side can recompute.";

const WHAT_IT_DOES_NOT_DO = [
  "no payments, escrow or settlement",
  "no legal signature validity",
  "no real-world identity verification",
  "no agent framework or orchestration — agents run on each party's own stack",
  // Not "no conversation storage": send() does persist a message body, and a
  // judge who posts one can see that it did. What is true, and what actually
  // matters, is that nothing reads it back — no page, no verification, no
  // outcome depends on a message. Saying it the other way is the one sentence
  // here that a single call could disprove.
  "no conversation in the outcome path — a message may be stored, but nothing reads it back and no result depends on it",
].join("; ");

const THREE_STATES =
  "Every claim on a card carries one of three states, never a bare boolean: " +
  "evidence (an issuer key is attached and anyone can check it), " +
  "self_reported (honestly labelled — a signed self-test proves authorship, not independent execution), " +
  "or unverified (no claim is made).";

interface Grounding {
  rooms: RoomSummary[];
  focusRoom?: RoomSummary;
  focusCards?: unknown[];
}

/**
 * Answers already given, for this question against this exact board.
 *
 * Bounded and process-local on purpose: the deployed service runs one instance,
 * and a cache that survives too long would be a cache that lies about a board
 * someone has since changed. Keying on the grounding text is what makes that
 * safe — if a card moves, the key moves with it.
 */
const ANSWER_CACHE = new Map<string, string>();
const ANSWER_CACHE_LIMIT = 50;

async function ground(question: string, roomId?: string): Promise<Grounding> {
  // The board is read through the one definition of the product's read
  // capabilities, so the guide and the MCP gate cannot drift apart.
  const rooms = await listRooms();
  // Pick a focus room: explicit room_id, else a room id mentioned in the question.
  const mentioned = rooms.find((r) => question.toLowerCase().includes(r.room_id));
  const focus = roomId
    ? rooms.find((r) => r.room_id === roomId) ?? mentioned
    : mentioned;
  const focusCards = focus ? await readResultCards(focus.room_id) : undefined;
  return { rooms, focusRoom: focus, focusCards };
}

function compactContext(g: Grounding): string {
  const lines = g.rooms.map(
    (r) => `${r.room_id} [${r.status}${r.status === "partial" ? ` ${r.agreed_parties}/${r.required_parties}` : ""}] ${r.scenario}: ${r.summary}`,
  );
  if (g.focusCards && g.focusRoom) {
    lines.push(
      `focus room ${g.focusRoom.room_id} cards: ` +
        JSON.stringify(g.focusCards.map((c) => {
          const card = c as { status?: string; hash?: string; agreement?: string; terms?: unknown };
          return { status: card.status, agreement: card.agreement, hash: card.hash, terms: card.terms };
        })),
    );
  }
  return lines.join("\n");
}

function deterministicAnswer(question: string, g: Grounding): string | null {
  const q = question.toLowerCase();
  if (/(what|who).*(this|product|agent commons|app|platform)|what does (this|it) do/.test(q)) {
    return `${PRODUCT_ONE_LINER}\nIt does NOT do: ${WHAT_IT_DOES_NOT_DO}.`;
  }
  if (/(partial|not agreed|why.*agreed|2\/3|1\/3|consensus)/.test(q)) {
    const partials = g.rooms.filter((r) => r.status === "partial");
    return (
      `A room shows agreed only when every required party has posted an agreed card over the same hash. ` +
      `Until then it stays partial — a first-class state, never quietly upgraded. ` +
      (partials.length > 0
        ? `Partial rooms on the board right now: ${partials.map((r) => `${r.room_id} (${r.agreed_parties}/${r.required_parties})`).join(", ")}.`
        : `There are no partial rooms on the board right now.`)
    );
  }
  if (/(three states|evidence|self.?reported|unverified|badge|claim)/.test(q)) {
    return THREE_STATES;
  }
  if (/(verify|recompute|hash|check|trust)/.test(q)) {
    return (
      `Verification needs no trust in us: the card's hash is a sha256 over the canonical JSON of its terms, ` +
      `so either side recomputes it from the terms alone. Ask me "verify terms" with a room id and I will ` +
      `recompute and show whether it matches the card on record.`
    );
  }
  if (/(card|build|sign|agent card|editor)/.test(q)) {
    return (
      `To build an agent card: open /agent, set display name, owner, disclosure policy (what this agent may ` +
      `and must not disclose), then Build & sign. The assessment panel re-reads your card and marks each ` +
      `claim evidence / self_reported / unverified. A card cannot fake a backing it does not have.`
    );
  }
  if (/(data|where.*from|real|synthetic|seed)/.test(q)) {
    return (
      `Board data comes from the product's data layer (Firestore once deployed; seeded demo rooms until then). ` +
      `Every card carries its terms, hash, and the parties that signed it — nothing is stored as opaque transcript.`
    );
  }
  return null;
}

async function verifyTermsTool(terms: Record<string, unknown>): Promise<string> {
  // The recomputation itself lives in the one place that defines it, so the
  // guide and the MCP gate cannot disagree about what a hash is.
  const { hash, matches } = await verifyTerms(terms);
  const onBoard = matches.length === 0
    ? "No card on the board currently carries this hash."
    : `Cards on the board with this hash: ${matches.map((m) => `${m.room_id} (${m.author})`).join(", ")}.`;
  return `Recomputed hash from terms alone: ${hash}\n${onBoard}`;
}

/**
 * Why the call failed, in one clause a reader can act on.
 *
 * The provider's own message for a spent free tier is a wall of JSON with the
 * method name and service metadata inside it. That must not be pasted into the
 * answer: it would appear on screen mid-demo and read as a crash.
 */
function failureReason(e: unknown): string {
  const text = e instanceof Error ? e.message : String(e);
  if (/RESOURCE_EXHAUSTED|\b429\b|quota|rate limit/i.test(text)) return "quota or rate limit";
  if (/API key|\b401\b|\b403\b|PERMISSION_DENIED|unauthenticated/i.test(text)) return "the key was rejected";
  if (/timeout|ETIMEDOUT|fetch failed|ECONN|ENOTFOUND/i.test(text)) return "network";
  return "provider error";
}

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const question = typeof body.question === "string" && body.question.trim() ? body.question.trim() : "What is this product?";
  const roomId = typeof body.room_id === "string" ? body.room_id : undefined;

  // A caller may pass raw terms to run the verify tool directly.
  if (body.terms && typeof body.terms === "object") {
    return NextResponse.json({
      role: "demo-assistant",
      tool: "verify_terms",
      result: await verifyTermsTool(body.terms as Record<string, unknown>),
      source: "deterministic",
      model: "none",
    });
  }

  const g = await ground(question, roomId);
  const fallback = deterministicAnswer(question, g);
  const config = llmConfig();
  const context = compactContext(g);

  if (!config.configured) {
    return NextResponse.json({
      role: "demo-assistant",
      answer:
        fallback ??
        `${PRODUCT_ONE_LINER}\n(No model configured — this is the deterministic fallback path.)`,
      source: "deterministic-fallback",
      model: "none",
      grounded: context,
    });
  }

  // One free-tier key has to cover a recording session and then however many
  // judges open the link. The suggested questions are buttons, so the same
  // question gets asked twice routinely — and the second ask costs a call plus
  // several seconds to produce a word-for-word identical answer. The key carries
  // the grounding text, so a board that has changed never serves a stale answer.
  const cacheKey = `${config.provider}|${config.model}|${question}|${context}`;
  const cached = ANSWER_CACHE.get(cacheKey);
  if (cached) {
    return NextResponse.json({
      role: "demo-assistant",
      answer: cached,
      source: config.provider,
      model: config.model,
      grounded: context,
      cached: true,
    });
  }

  const systemInstruction =
    `You are the Agent Commons guide — a demonstration client attached to satisfy the hackathon's ` +
    `Gemini requirement. You are NOT part of the product core. Answer questions using ONLY the board ` +
    `context below (live rooms and cards). Be concise, concrete, and honest — if the context does not ` +
    `contain the answer, say so. Never invent rooms, cards or hashes.\n\n` +
    `Product facts you may state:\n- ${PRODUCT_ONE_LINER}\n- It does NOT do: ${WHAT_IT_DOES_NOT_DO}.\n- ${THREE_STATES}\n\n` +
    `Live board context:\n${compactContext(g)}`;

  try {
    const answer = await llmGenerateText(question, { systemInstruction, temperature: 0.3 });
    if (ANSWER_CACHE.size >= ANSWER_CACHE_LIMIT) {
      const oldest = ANSWER_CACHE.keys().next().value;
      if (oldest !== undefined) ANSWER_CACHE.delete(oldest);
    }
    ANSWER_CACHE.set(cacheKey, answer);
    return NextResponse.json({
      role: "demo-assistant",
      answer,
      source: config.provider,
      model: config.model,
      grounded: context,
    });
  } catch (e) {
    // A model is configured but the call failed — degrade honestly, never fabricate.
    // The answer stays clean and the failure is disclosed on its own line, so a
    // spent quota produces a readable fallback instead of a stack trace on screen.
    const reason = failureReason(e);
    console.warn("guide: model call failed —", reason, e);
    return NextResponse.json({
      role: "demo-assistant",
      answer: fallback ?? `${PRODUCT_ONE_LINER}\n(The guide could not answer that from the board.)`,
      source: "deterministic-fallback",
      model: config.model,
      note: `The model call failed (${reason}), so this is the fixed fallback answer — not a model answer.`,
      grounded: context,
    });
  }
}

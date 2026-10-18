import Link from "next/link";
import { notFound } from "next/navigation";
import { listRooms, readResultCards } from "@/lib/outcome-service";
import { getSignOffTransport } from "@/lib/sign-off-transport";
import { mergeResultCards } from "@/lib/result-card";
import { canConfirm, cardStage, findSignOff, type HumanSignOff } from "@/lib/human-signoff";
import { recomputeHash } from "@/lib/seed";
import { signatureLabel, signatureSummary, signatureTone } from "@/lib/card-signature";
import { assessCard } from "@/lib/agent-card";
import { verifyCard, verifyEvidence } from "@/lib/agent-card-demo";
import { cardsForRoom, counterpartyTrust } from "@/lib/agent-trust";
import { trustWarning } from "@/lib/trust-badges";
import { TrustWarning } from "@/components/trust-warning";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { agentName, buildOverview, readableTerms } from "@/lib/overview";
import type { RoomSummary } from "@/lib/transport";
import type { ResultCard } from "@/lib/result-card";
import { confirmSignOff } from "./actions";
import { AuthGate } from "@/components/auth-gate";
import { cn } from "@/lib/utils";

/**
 * Deal page — one negotiation, read by a person.
 *
 * Top: who the deal is with, the terms in plain words, where it stands, and the
 * one action the person can take. Below, folded away, the proof for auditors:
 * result cards with their recomputable hashes and each participant's claims,
 * shown claim-by-claim (evidence / self-reported / unverified / lapsed) — never
 * a bare boolean.
 */

type Tone = "green" | "amber" | "red" | "neutral" | "blue";

/** Where the deal stands, in one plain sentence. */
function dealState(
  room: RoomSummary,
  cards: ResultCard[],
  signOffs: HumanSignOff[],
): { tone: Tone; label: string } {
  const signed = cards.map((c) => findSignOff(signOffs, c)).find(Boolean);
  if (signed) return { tone: "green", label: `Deal closed — signed off by ${signed.display_name}` };
  switch (room.status) {
    case "agreed":
      return cards.some((c) => canConfirm(c, signOffs))
        ? { tone: "amber", label: "Everyone agreed — waiting for your confirmation" }
        : { tone: "green", label: "Everyone agreed" };
    case "partial":
      return {
        tone: "blue",
        label: `${room.agreed_parties} of ${room.required_parties} sides agreed — still waiting on the rest`,
      };
    case "impasse":
      return { tone: "red", label: "No deal — the sides could not meet" };
    case "no-match":
      return { tone: "neutral", label: "Stopped before talks — failed the background check" };
    default:
      return { tone: "blue", label: "Agents are still negotiating" };
  }
}

const STATE_STYLE: Record<Tone, string> = {
  green: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  amber: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  red: "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300",
  neutral: "border-neutral-300 bg-neutral-50 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300",
  blue: "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300",
};

const STATUS_TONE = {
  evidence: "green",
  self_reported: "amber",
  unverified: "neutral",
} as const;

export default async function RoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const transport = getSignOffTransport();
  // Read through the product's read capabilities, so a card posted over the MCP
  // gate is on this page exactly like a seeded one. The human step below is
  // still read from the sign-off transport, which owns it.
  const rooms = await listRooms();
  const room = rooms.find((r) => r.room_id === id);
  if (!room) notFound();

  const cards = await readResultCards(id);
  const merged = mergeResultCards(cards);
  // Read from the transport, never from a copy kept on the page: the board and
  // the next page load have to agree with what this page shows.
  const signOffs = await transport.listSignOffs();

  // The buyer is the agent present in every procurement room; the deal is
  // named after whoever sits across from them.
  const allEntries = await Promise.all(
    rooms.map(async (r) => ({ room: r, cards: mergeResultCards(await readResultCards(r.room_id)) })),
  );
  const { buyer } = buildOverview(allEntries, signOffs);
  const others = room.participants.filter((p) => p !== buyer?.id).map(agentName);
  const title =
    buyer && others.length < room.participants.length
      ? `Deal with ${others.join(", ")}`
      : others.join(", ");
  const state = dealState(room, merged, signOffs);
  const primary = merged[0];
  const pending = merged.find((c) => canConfirm(c, signOffs));
  const counterparty = counterpartyTrust(id);
  const warning = counterparty ? trustWarning(counterparty) : null;

  const agentCards = cardsForRoom(id).map((card) => {
    const assessment = assessCard(card, verifyCard(card));
    // A receiver checks each evidence object against its stated issuer key.
    const evidenceChecks = assessment.claims.map((c) => {
      const ev = card.claims[c.key].evidence;
      return { key: c.key, verified: ev ? verifyEvidence(ev) : null, issuer: ev?.issuer ?? null };
    });
    return { card, assessment, evidenceChecks };
  });

  const flagged = agentCards.some(
    (c) => c.card.claims.screening.evidence?.payload.matched === true,
  );

  return (
    <AuthGate>
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-12">
        <Link href="/" className="text-sm text-sky-700 hover:underline dark:text-sky-400">
        ← Overview
      </Link>

      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-base text-neutral-700 dark:text-neutral-300">{room.summary}</p>
        <div className={cn("w-fit rounded-full border px-3 py-1 text-sm font-medium", STATE_STYLE[state.tone])}>
          {state.label}
        </div>
        {flagged && (
          <p className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
            Screening flag: this counterparty failed the background check. Talks are on
            hold until a person clears it.
          </p>
        )}
      </header>

      {primary && room.status !== "no-match" && (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <div className="px-5 pt-4 text-xs font-medium uppercase tracking-wide text-neutral-500">
            {room.status === "impasse" ? "Last offer on the table" : "Terms"}
          </div>
          <dl className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
            {readableTerms(primary.terms).map((t) => (
              <div key={t.label}>
                <dt className="text-xs text-neutral-500">{t.label}</dt>
                <dd className="text-lg font-semibold">{t.value}</dd>
              </div>
            ))}
          </dl>
          {pending && warning && <TrustWarning message={warning} />}
          {pending && (
            <form
              action={confirmSignOff}
              className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 bg-neutral-50 px-5 py-3 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <input type="hidden" name="room_id" value={pending.room_id} />
              <input type="hidden" name="hash" value={pending.hash} />
              <span className="text-xs text-neutral-500">
                Demo-level confirmation of these exact terms — no legal signature validity.
              </span>
              <button
                type="submit"
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
              >
                Confirm deal
              </button>
            </form>
          )}
        </div>
      )}

      <details className="group rounded-2xl border border-neutral-200 dark:border-neutral-800">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
          Proof for auditors — signed result cards and agent checks
          <span className="text-neutral-400 transition-transform group-open:rotate-90">›</span>
        </summary>
        <div className="border-t border-neutral-200 p-5 dark:border-neutral-800">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="flex flex-col gap-4 lg:col-span-2">
          <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
            Result cards
          </h2>
          {merged.map((card) => {
            const recomputed = recomputeHash(card);
            const hashOk = recomputed === card.hash;
            // The signature belongs to each card as posted, not to this merged
            // row — the merge unions `agreed_by`, which no issuer ever signed.
            const signatures = signatureSummary(cards.filter((c) => c.hash === card.hash));
            const stage = cardStage(card, signOffs);
            const signOff = findSignOff(signOffs, card);
            return (
              <Card key={card.hash + card.author}>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle className="text-sm">
                    {card.status}
                    <span className="ml-2 font-normal text-neutral-500">
                      agreement: {card.agreement} ({card.agreed_by.length}/
                      {card.required_parties.length})
                    </span>
                  </CardTitle>
                  <span className="flex shrink-0 gap-2">
                    <Badge tone={hashOk ? "green" : "red"}>
                      {hashOk ? "hash recomputes" : "hash mismatch"}
                    </Badge>
                    <Badge tone={signatureTone(signatures)}>{signatureLabel(signatures)}</Badge>
                  </span>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <p className="text-sm text-neutral-700 dark:text-neutral-300">{card.summary}</p>
                  <dl className="grid grid-cols-2 gap-2 text-xs">
                    {Object.entries(card.terms).map(([k, v]) => (
                      <div key={k} className="flex flex-col">
                        <dt className="text-neutral-500">{k}</dt>
                        <dd className="font-mono">{String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-neutral-500">terms hash</span>
                    <code className="break-all rounded bg-neutral-100 p-2 font-mono text-[11px] dark:bg-neutral-900">
                      {card.hash}
                    </code>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="text-xs text-neutral-500">
                      next step: {stage ?? "none"}
                      {signOff && (
                        <Badge tone="green" className="ml-2">
                          signed off
                        </Badge>
                      )}
                    </div>
                    {signOff ? (
                      <p className="text-xs text-neutral-600 dark:text-neutral-400">
                        Confirmed by{" "}
                        <span className="font-medium">{signOff.display_name}</span> at{" "}
                        <span className="font-mono">{signOff.signed_off_at}</span>. Demo-level
                        confirmation of these terms — no legal signature validity.
                      </p>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {merged.length === 0 && (
            <Card>
              <CardContent className="pt-5 text-sm text-neutral-500">
                Negotiating — no result card posted yet.
              </CardContent>
            </Card>
          )}
        </section>

        <aside className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
            Participants
          </h2>
          {agentCards.map(({ card, assessment, evidenceChecks }) => (
            <Card key={card.agent_id}>
              <CardHeader className="gap-2 p-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">{card.display_name}</CardTitle>
                  <Badge tone={assessment.lapsed ? "amber" : "blue"}>
                    {assessment.lapsed ? "claims lapsed" : assessment.level}
                  </Badge>
                </div>
                <div className="text-xs text-neutral-500">
                  owner: {card.owner.name}
                  {assessment.lapsed && " · expired/revoked"}
                </div>
                <ul className="mt-1 flex flex-col gap-1">
                  {assessment.claims.map((c) => {
                    const check = evidenceChecks.find((e) => e.key === c.key);
                    return (
                      <li key={c.key} className="flex flex-col gap-1 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-neutral-600 dark:text-neutral-400">
                            <span className="font-mono text-[10px] text-neutral-400">{c.level}</span>{" "}
                            {c.key}
                          </span>
                          <Badge tone={STATUS_TONE[c.status as keyof typeof STATUS_TONE] ?? "neutral"}>
                            {c.label}
                          </Badge>
                        </div>
                        {check?.verified !== null && check?.verified !== undefined && (
                          <div className="flex items-center justify-between gap-2 pl-2 text-[11px] text-neutral-500">
                            <span>evidence signature vs issuer key</span>
                            <Badge tone={check.verified ? "green" : "red"}>
                              {check.verified ? "valid" : "invalid"}
                            </Badge>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </CardHeader>
            </Card>
          ))}
          <Card>
            <CardContent className="pt-5 text-xs text-neutral-500">
              Each claim is shown as evidence / self-reported / unverified — never a
              bare boolean. Every evidence object is checked against its{" "}
              <em>issuer key</em>: a valid signature proves authorship, not
              independent execution. L0 key authentication is separate from the
              authority claims (L1–L3), so a lapsed card still authenticates its
              messages.
              <br />
              <br />
              An agent discloses only what <em>its own</em> owner policy allows — a
              counterparty&apos;s card is never authorization for us to share our data.
            </CardContent>
          </Card>
        </aside>
      </div>
        </div>
      </details>
    </main>
    </AuthGate>
  );
}

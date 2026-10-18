import { listRooms, readResultCards } from "@/lib/outcome-service";
import { mergeResultCards } from "@/lib/result-card";
import { getSignOffTransport } from "@/lib/sign-off-transport";
import {
  buildOverview,
  funnelStages,
  initials,
  readableTerms,
  type PendingDeal,
} from "@/lib/overview";
import { confirmSignOff } from "@/app/room/[id]/actions";
import { GuidePanel } from "@/components/guide-panel";
import { llmConfig } from "@/lib/llm";
import { DealFunnel } from "@/components/deal-funnel";
import { counterpartyTrust } from "@/lib/agent-trust";
import { conversationUrl } from "@/lib/conversation-links";
import { trustWarning } from "@/lib/trust-badges";
import { TrustWarning } from "@/components/trust-warning";
import { DATA_PROVENANCE } from "@/lib/scenarios";
import { AuthGate } from "@/components/auth-gate";
import { cn } from "@/lib/utils";

/**
 * Overview — the human's first screen.
 *
 * One story, three questions: how are the purchases going (funnel), where does
 * each supplier stand (one row each, details on click), and what is waiting on
 * me (deals to confirm). Everything is derived in `@/lib/overview` from the
 * same rooms, cards and sign-offs the board and the room pages read.
 */

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const rooms = await listRooms();
  const signOffs = await getSignOffTransport().listSignOffs();
  const rawCards = await Promise.all(rooms.map((room) => readResultCards(room.room_id)));
  const entries = rooms.map((room, i) => ({ room, cards: mergeResultCards(rawCards[i]) }));

  const { buyer, suppliers, pending } = buildOverview(entries, signOffs);
  const llm = llmConfig();
  const stages = funnelStages(suppliers);
  const trusts = Object.fromEntries(suppliers.map((s) => [s.roomId, counterpartyTrust(s.roomId)]));
  const links = Object.fromEntries(suppliers.map((s) => [s.roomId, conversationUrl(s.roomId)]));
  const waitingValue = pending.reduce(
    (sum, d) => sum + (suppliers.find((s) => s.roomId === d.room.room_id)?.value ?? 0),
    0,
  );

  return (
    <AuthGate>
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-10 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="max-w-2xl text-base text-neutral-700 dark:text-neutral-300">
          Your buying agent{buyer ? ` (${buyer.name})` : ""} is sourcing{" "}
          {suppliers.length} product lines for the spring range. Here&apos;s where each supplier
          stands.
        </p>
        {pending.length > 0 && (
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
            {pending.length === 1
              ? "One deal"
              : `${pending.length} deals`}
            {waitingValue > 0 ? ` worth $${waitingValue.toLocaleString("en-US")}` : ""}{" "}
            {pending.length === 1 ? "is" : "are"} ready and waiting for your confirmation.
          </p>
        )}
      </header>

      {pending.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold tracking-tight">Waiting for you</h2>
          {pending.map((deal) => (
            <DealCard key={`${deal.room.room_id}-${deal.card.hash}`} deal={deal} />
          ))}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold tracking-tight">How the deals are going</h2>
        <DealFunnel stages={stages} suppliers={suppliers} trusts={trusts} links={links} />
      </section>

      <section>
        <GuidePanel provider={llm.provider} model={llm.model} />
      </section>

      <footer className="text-xs text-neutral-500">{DATA_PROVENANCE}</footer>
    </main>
    </AuthGate>
  );
}

function DealCard({ deal }: { deal: PendingDeal }) {
  const { room, card, supplier } = deal;
  const terms = readableTerms(card.terms);
  const trust = counterpartyTrust(room.room_id);
  const warning = trust ? trustWarning(trust) : null;
  return (
    <div className="overflow-hidden rounded-2xl border border-amber-300 bg-white dark:border-amber-800 dark:bg-neutral-950">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-amber-100 text-sm font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            {initials(supplier)}
          </div>
          <div>
            <div className="font-medium">Deal with {supplier}</div>
            <div className="text-sm text-neutral-600 dark:text-neutral-400">
              Your agent and the supplier both agreed. Confirm to close the deal.
            </div>
          </div>
        </div>
      </div>
      <dl
        className="grid border-y border-neutral-200 dark:border-neutral-800"
        style={{ gridTemplateColumns: `repeat(${Math.min(terms.length, 4)}, minmax(0, 1fr))` }}
      >
        {terms.map((t, i) => (
          <div
            key={t.label}
            className={cn("px-5 py-3", i % 4 !== 0 && "border-l border-neutral-200 dark:border-neutral-800")}
          >
            <dt className="text-xs text-neutral-500">{t.label}</dt>
            <dd className="text-base font-semibold">{t.value}</dd>
          </div>
        ))}
      </dl>
      {warning && <TrustWarning message={warning} />}
      <form
        action={confirmSignOff}
        className="flex flex-wrap items-center justify-between gap-3 bg-neutral-50 px-5 py-3 dark:bg-neutral-900"
      >
        <input type="hidden" name="room_id" value={room.room_id} />
        <input type="hidden" name="hash" value={card.hash} />
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
    </div>
  );
}

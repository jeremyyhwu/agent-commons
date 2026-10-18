import Link from "next/link";
import { type RoomStatus } from "@/lib/transport";
import { listRooms, readResultCards } from "@/lib/outcome-service";
import { getSignOffTransport, roomStage } from "@/lib/sign-off-transport";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { GuidePanel } from "@/components/guide-panel";
import { llmConfig } from "@/lib/llm";
import { SCENARIOS, DATA_PROVENANCE } from "@/lib/scenarios";

/**
 * Results board — one row per room.
 *
 * Outcomes only: no transcripts, no activity feed, no approval queue.
 * This is the whole "dashboard" of the product (the communication-linked one).
 * A row also carries the terminal human step — whether that result is still
 * awaiting a signature or has been signed off — read from the same transport
 * the room page writes to.
 *
 * In Firestore mode the board is live state, so it must render per request —
 * a prerendered board would freeze whatever rooms happened to exist at build
 * time, and would need Firestore credentials during the image build. The demo
 * seed is in memory, so re-rendering it costs nothing. `dynamic` has to be a
 * literal for Next to accept it, so both modes render fresh.
 */
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<RoomStatus, "green" | "amber" | "red" | "neutral" | "blue"> = {
  agreed: "green",
  partial: "amber",
  impasse: "red",
  "no-match": "neutral",
  negotiating: "blue",
};

function statusLabel(status: RoomStatus, required: number, agreed: number): string {
  switch (status) {
    case "agreed":
      return "agreed";
    case "partial":
      return `partial ${agreed}/${required}`;
    case "impasse":
      return "impasse";
    case "no-match":
      return "no-match";
    default:
      return "negotiating";
  }
}

export default async function BoardPage() {
  const transport = getSignOffTransport();
  // Rooms and cards come from the product's read capabilities, so a card posted
  // over the MCP gate shows up on this board exactly like a seeded one — the
  // board is the same view either way. The human step stays on the sign-off
  // transport, which owns it.
  const rooms = await listRooms();
  const signOffs = await transport.listSignOffs();
  const scenarioCount = SCENARIOS.length;
  // The panel names the model that answers, so it has to be told which one this
  // build is running. Without the props it cannot tell "Gemini" from "nothing
  // configured" and used to claim the former either way.
  const llm = llmConfig();

  // Derived per row from the cards the room actually rolled up to — the same
  // derivation the room page uses, so the two views cannot disagree.
  const stageByRoom = new Map<string, string | null>();
  for (const room of rooms) {
    const cards = await readResultCards(room.room_id);
    stageByRoom.set(room.room_id, roomStage(cards, signOffs));
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Agent Commons</h1>
          <Badge tone="blue">results board</Badge>
        </div>
        <p className="max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
          Cross-organization agent negotiation rooms. Agents negotiate autonomously;
          humans enter only at the final decision. This board shows{" "}
          <span className="font-medium text-neutral-900 dark:text-neutral-100">outcomes</span>,
          one row per room — never conversation activity.
        </p>
      </header>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <Card className="min-w-0 flex-1">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Rooms</CardTitle>
            <span className="text-xs text-neutral-500">
              {rooms.length} rooms · {scenarioCount} scenarios on one engine
            </span>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800">
                  <th className="py-2 pr-4 font-medium">Room</th>
                  <th className="py-2 pr-4 font-medium">Scenario</th>
                  <th className="py-2 pr-4 font-medium">Parties</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((room) => (
                  <tr
                    key={room.room_id}
                    className="border-b border-neutral-100 last:border-0 dark:border-neutral-900"
                  >
                    <td className="py-3 pr-4 align-top">
                      <Link
                        href={`/room/${room.room_id}`}
                        className="font-medium text-sky-700 hover:underline dark:text-sky-400"
                      >
                        {room.room_id}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 align-top text-neutral-600 dark:text-neutral-400">
                      {room.scenario}
                    </td>
                    <td className="py-3 pr-4 align-top text-neutral-600 dark:text-neutral-400">
                      {room.participants.length}
                    </td>
                    <td className="py-3 pr-4 align-top">
                      <Badge tone={STATUS_TONE[room.status]}>
                        {statusLabel(room.status, room.required_parties, room.agreed_parties)}
                      </Badge>
                      {stageByRoom.get(room.room_id) === "awaiting_signature" && (
                        <Badge tone="blue" className="ml-2">
                          awaiting signature
                        </Badge>
                      )}
                      {stageByRoom.get(room.room_id) === "signed_off" && (
                        <Badge tone="green" className="ml-2">
                          signed off
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 pr-4 align-top text-neutral-700 dark:text-neutral-300">
                      {room.summary}
                    </td>
                  </tr>
                ))}
                {rooms.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-neutral-500">
                      No rooms yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <div className="w-full shrink-0 lg:w-80">
          <GuidePanel provider={llm.provider} model={llm.model} />
        </div>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          One engine, five instruction sets
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SCENARIOS.map((s) => (
            <Card key={s.id}>
              <CardHeader className="gap-1 p-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">{s.label}</CardTitle>
                  {s.multiParty && <Badge tone="blue">multi-party</Badge>}
                </div>
                <p className="text-xs text-neutral-600 dark:text-neutral-400">{s.blurb}</p>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <footer className="flex flex-col gap-1 text-xs text-neutral-500">
        <span>
          Result hashes are recomputable by any party from the terms alone.
          Verification badges describe what each level actually is — no real-world
          identity is claimed.
        </span>
        <span>{DATA_PROVENANCE}</span>
      </footer>
    </main>
  );
}

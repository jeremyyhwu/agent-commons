import Link from "next/link";
import { listRooms, readResultCards } from "@/lib/outcome-service";
import { mergeResultCards } from "@/lib/result-card";
import { getSignOffTransport } from "@/lib/sign-off-transport";
import { buildOverview } from "@/lib/overview";
import { buyerProfile, buyerTrust } from "@/lib/agent-trust";
import { TrustLegend } from "@/components/trust-badges";
import { YourAgents, type AgentSummary } from "@/components/your-agents";
import { AuthGate } from "@/components/auth-gate";

/**
 * Agents — the agents that work for you.
 *
 * Every agent shows its four trust checks as badges: verified, only claimed,
 * or failed/expired. The counterparties' agents live with their companies on
 * the Overview, so they are not repeated here.
 */

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const rooms = await listRooms();
  const signOffs = await getSignOffTransport().listSignOffs();
  const entries = await Promise.all(
    rooms.map(async (room) => ({ room, cards: mergeResultCards(await readResultCards(room.room_id)) })),
  );
  const { suppliers } = buildOverview(entries, signOffs);

  const buyer = buyerTrust();
  const profile = buyerProfile();
  const seeded: AgentSummary = {
    id: "seeded-buyer",
    name: buyer.name,
    company: buyer.company,
    role: `buying parts · negotiating with ${suppliers.length} companies`,
    badges: buyer.badges,
    policy: profile.policy,
    basics: {
      display_name: buyer.name,
      owner_name: buyer.company,
      owner_contact: profile.contact,
      capabilities: profile.capabilities,
      levels: { owner_binding: true, capability_probe: true, screening: true },
    },
  };

  return (
    <AuthGate>
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-10 px-6 py-12">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
          <p className="max-w-2xl text-base text-neutral-700 dark:text-neutral-300">
            The agents that work for you. Other companies&apos; agents check these badges before
            they agree to negotiate — the companies you deal with, and their agents&apos; badges,
            are on the{" "}
            <Link href="/" className="text-sky-700 hover:underline dark:text-sky-400">
              Overview
            </Link>
            .
          </p>
        </header>

        <YourAgents seeded={seeded} />

        <section className="rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800">
          <h2 className="mb-3 text-sm font-semibold">What the badges mean</h2>
          <TrustLegend />
        </section>
      </main>
    </AuthGate>
  );
}

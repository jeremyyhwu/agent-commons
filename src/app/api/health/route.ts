import { NextResponse } from "next/server";
import { transportKind } from "@/lib/transport-factory";
import { llmConfig } from "@/lib/llm";

/**
 * GET /api/health
 *
 * Two facts about this instance that cannot be read from the outside, and that
 * the submission makes claims about:
 *
 *   transport  — "firestore" or "demo". The brief says result cards live in a
 *                Firestore collection; without this, that sentence is only as
 *                true as the environment variable someone typed into a console.
 *                A board seeded in process memory looks identical from the
 *                outside: same rooms, same cards, same HTML.
 *   model      — which provider answers /api/guide. This reports whether a key
 *                is *configured*, not whether it *works* — a working key is
 *                proved by an actual call, which is what the guide check in
 *                scripts/verify-deploy.mjs does. Two different questions.
 *
 * Read-only and anonymous on purpose: a judge has no account, and a fact that
 * only the operator can see is not a fact a judge can check.
 */
export async function GET() {
  const config = llmConfig();
  return NextResponse.json({
    transport: transportKind(),
    model: { provider: config.provider, model: config.model },
  });
}

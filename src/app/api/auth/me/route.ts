import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/firebase-admin";

/**
 * GET /api/auth/me
 *
 * Lightweight authenticated endpoint — useful for verifying the server-side
 * auth wiring works on Cloud Run before hitting Firestore-backed routes.
 *
 * Requires a valid Firebase ID token in the Authorization header:
 *   Authorization: Bearer <id-token>
 *
 * The client token is obtained via `await auth.currentUser.getIdToken()`.
 */
export async function GET(request: Request) {
  try {
    const { uid, orgId } = await requireAuth(request);
    return NextResponse.json({ ok: true, uid, orgId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.includes("Authorization") ? 401 : 403;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

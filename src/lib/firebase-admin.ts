import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

/**
 * Server-side Firebase Admin — the bridge that lets API routes authenticate
 * users by their Firebase ID token and reach Firestore with application-default
 * credentials.
 *
 * On Cloud Run the service account attached to the service has the
 * `firebase.admin` role (or the granular Firestore + IAM roles). No key file
 * is needed — `applicationDefault()` resolves credentials from the metadata
 * server. Locally it reads GOOGLE_APPLICATION_CREDENTIALS or the Firestore
 * emulator host.
 *
 * Singleton: Next.js serverless boots each route handler in the same module
 * instance, so initialising once per process avoids re-dialling the metadata
 * server on every request.
 */

const APP_NAME = "agent-commons-admin";

function env(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

let appCache: App | null = null;

function resolveApp(): App {
  if (appCache) return appCache;

  const existing = getApps().find((a) => a.name === APP_NAME);
  if (existing) {
    appCache = existing;
    return appCache;
  }

  const projectId =
    env("FIRESTORE_PROJECT_ID") ??
    env("GCLOUD_PROJECT") ??
    env("GOOGLE_CLOUD_PROJECT");

  if (!projectId) {
    throw new Error(
      "firebase-admin: FIRESTORE_PROJECT_ID is not set. " +
        "On Cloud Run set it via --set-env-vars; locally run from .env or set GOOGLE_CLOUD_PROJECT.",
    );
  }

  const gac = env("GOOGLE_APPLICATION_CREDENTIALS");
  const emulator = env("FIRESTORE_EMULATOR_HOST");

  appCache = initializeApp(
    emulator
      ? { projectId }
      : {
          projectId,
          credential: gac ? cert(gac) : undefined, // applicationDefault() — metadata server on Cloud Run
        },
    APP_NAME,
  );
  return appCache;
}

export function getApp(): App {
  if (typeof window !== "undefined") {
    throw new Error("firebase-admin must only be used on the server");
  }
  return resolveApp();
}

let dbCache: Firestore | null = null;

/** Cached Firestore instance, resolved the same way the transport uses it. */
export function getAdminDb(): Firestore {
  if (typeof window !== "undefined") {
    throw new Error("getAdminDb must only be called on the server");
  }
  if (!dbCache) {
    const app = getApp();
    const databaseId = env("FIRESTORE_DATABASE_ID");
    dbCache =
      databaseId && databaseId !== "(default)" ? getFirestore(app, databaseId) : getFirestore(app);
  }
  return dbCache;
}

/** Extract and verify the Firebase ID token from an Authorization header. */
export async function authenticateBearerToken(
  request: Request,
): Promise<DecodedIdToken> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header — expected 'Bearer <id-token>'");
  }
  const idToken = authHeader.slice(7);
  return getAuth(getApp()).verifyIdToken(idToken);
}

/** Convenience: returns { uid, orgId } for an authenticated request, or throws. */
export async function requireAuth(request: Request): Promise<{ uid: string; orgId: string }> {
  const decoded = await authenticateBearerToken(request);
  const uid = decoded.uid;

  const userSnap = await getAdminDb().collection("users").doc(uid).get();
  const orgId = userSnap.exists ? (userSnap.data()?.defaultOrgId as string | undefined) : undefined;
  if (!orgId) {
    throw new Error(
      `User ${uid} has no default organization — sign in again to create one`,
    );
  }
  return { uid, orgId };
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getApp = getApp;
exports.getAdminDb = getAdminDb;
exports.authenticateBearerToken = authenticateBearerToken;
exports.requireAuth = requireAuth;
const app_1 = require("firebase-admin/app");
const auth_1 = require("firebase-admin/auth");
const firestore_1 = require("firebase-admin/firestore");
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
function env(name) {
    var _a;
    const v = (_a = process.env[name]) === null || _a === void 0 ? void 0 : _a.trim();
    return v ? v : undefined;
}
let appCache = null;
function resolveApp() {
    var _a, _b;
    if (appCache)
        return appCache;
    const existing = (0, app_1.getApps)().find((a) => a.name === APP_NAME);
    if (existing) {
        appCache = existing;
        return appCache;
    }
    const projectId = (_b = (_a = env("FIRESTORE_PROJECT_ID")) !== null && _a !== void 0 ? _a : env("GCLOUD_PROJECT")) !== null && _b !== void 0 ? _b : env("GOOGLE_CLOUD_PROJECT");
    if (!projectId) {
        throw new Error("firebase-admin: FIRESTORE_PROJECT_ID is not set. " +
            "On Cloud Run set it via --set-env-vars; locally run from .env or set GOOGLE_CLOUD_PROJECT.");
    }
    const gac = env("GOOGLE_APPLICATION_CREDENTIALS");
    const emulator = env("FIRESTORE_EMULATOR_HOST");
    appCache = (0, app_1.initializeApp)(emulator
        ? { projectId }
        : {
            projectId,
            credential: gac ? (0, app_1.cert)(gac) : undefined, // applicationDefault() — metadata server on Cloud Run
        }, APP_NAME);
    return appCache;
}
function getApp() {
    if (typeof window !== "undefined") {
        throw new Error("firebase-admin must only be used on the server");
    }
    return resolveApp();
}
let dbCache = null;
/** Cached Firestore instance, resolved the same way the transport uses it. */
function getAdminDb() {
    if (typeof window !== "undefined") {
        throw new Error("getAdminDb must only be called on the server");
    }
    if (!dbCache) {
        const app = getApp();
        const databaseId = env("FIRESTORE_DATABASE_ID");
        dbCache =
            databaseId && databaseId !== "(default)" ? (0, firestore_1.getFirestore)(app, databaseId) : (0, firestore_1.getFirestore)(app);
    }
    return dbCache;
}
/** Extract and verify the Firebase ID token from an Authorization header. */
async function authenticateBearerToken(request) {
    const authHeader = request.headers.get("authorization");
    if (!(authHeader === null || authHeader === void 0 ? void 0 : authHeader.startsWith("Bearer "))) {
        throw new Error("Missing or invalid Authorization header — expected 'Bearer <id-token>'");
    }
    const idToken = authHeader.slice(7);
    return (0, auth_1.getAuth)(getApp()).verifyIdToken(idToken);
}
/** Convenience: returns { uid, orgId } for an authenticated request, or throws. */
async function requireAuth(request) {
    var _a;
    const decoded = await authenticateBearerToken(request);
    const uid = decoded.uid;
    const userSnap = await getAdminDb().collection("users").doc(uid).get();
    const orgId = userSnap.exists ? (_a = userSnap.data()) === null || _a === void 0 ? void 0 : _a.defaultOrgId : undefined;
    if (!orgId) {
        throw new Error(`User ${uid} has no default organization — sign in again to create one`);
    }
    return { uid, orgId };
}

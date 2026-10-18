"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OperationType = exports.updateProfile = exports.signOut = exports.createUserWithEmailAndPassword = exports.signInWithEmailAndPassword = exports.signInWithPopup = exports.googleProvider = exports.auth = exports.db = void 0;
exports.handleFirestoreError = handleFirestoreError;
exports.sanitizePayload = sanitizePayload;
exports.testConnection = testConnection;
const app_1 = require("firebase/app");
const auth_1 = require("firebase/auth");
Object.defineProperty(exports, "signInWithPopup", { enumerable: true, get: function () { return auth_1.signInWithPopup; } });
Object.defineProperty(exports, "signInWithEmailAndPassword", { enumerable: true, get: function () { return auth_1.signInWithEmailAndPassword; } });
Object.defineProperty(exports, "createUserWithEmailAndPassword", { enumerable: true, get: function () { return auth_1.createUserWithEmailAndPassword; } });
Object.defineProperty(exports, "signOut", { enumerable: true, get: function () { return auth_1.signOut; } });
Object.defineProperty(exports, "updateProfile", { enumerable: true, get: function () { return auth_1.updateProfile; } });
const firestore_1 = require("firebase/firestore");
// Firebase config from environment variables (exposed to client)
// Use NEXT_PUBLIC_ prefix so they are available in-browser.
// See https://nextjs.org/docs/pages/building-your-application/configuring/environment-variables
//
// NEXT_PUBLIC_* vars are inlined at BUILD time by Next.js. During a clean
// build (CI, Cloud Build) the env vars may be absent — fall back to
// valid-looking placeholders so initialiseApp does not throw. On Cloud Run
// the real values must be substituted at build time (see cloudbuild.yaml).
const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyPlaceholderBuildTimeKey",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "localhost",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "placeholder-project",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "localhost",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "0",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "placeholder-app-id",
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};
// Initialize Firebase App
const app = (0, app_1.getApps)().length === 0 ? (0, app_1.initializeApp)(firebaseConfig) : (0, app_1.getApp)();
// Database and Auth instances
// firestoreDatabaseId can be passed as second arg; if empty string or undefined, use default
const databaseId = (_a = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID) === null || _a === void 0 ? void 0 : _a.trim();
exports.db = databaseId ? (0, firestore_1.getFirestore)(app, databaseId) : (0, firestore_1.getFirestore)(app);
exports.auth = (0, auth_1.getAuth)(app);
exports.googleProvider = new auth_1.GoogleAuthProvider();
// Error info structure mandated by Firestore integration guidelines
var OperationType;
(function (OperationType) {
    OperationType["CREATE"] = "create";
    OperationType["UPDATE"] = "update";
    OperationType["DELETE"] = "delete";
    OperationType["LIST"] = "list";
    OperationType["GET"] = "get";
    OperationType["WRITE"] = "write";
})(OperationType || (exports.OperationType = OperationType = {}));
function handleFirestoreError(error, operationType, path) {
    var _a, _b, _c, _d, _e, _f, _g;
    const errInfo = {
        error: error instanceof Error ? error.message : String(error),
        authInfo: {
            userId: (_a = exports.auth.currentUser) === null || _a === void 0 ? void 0 : _a.uid,
            email: (_b = exports.auth.currentUser) === null || _b === void 0 ? void 0 : _b.email,
            emailVerified: (_c = exports.auth.currentUser) === null || _c === void 0 ? void 0 : _c.emailVerified,
            isAnonymous: (_d = exports.auth.currentUser) === null || _d === void 0 ? void 0 : _d.isAnonymous,
            tenantId: (_e = exports.auth.currentUser) === null || _e === void 0 ? void 0 : _e.tenantId,
            providerInfo: ((_g = (_f = exports.auth.currentUser) === null || _f === void 0 ? void 0 : _f.providerData) === null || _g === void 0 ? void 0 : _g.map((provider) => ({
                providerId: provider.providerId,
                email: provider.email,
            }))) || [],
        },
        operationType,
        path,
    };
    console.error("Firestore Error: ", JSON.stringify(errInfo));
    throw new Error(JSON.stringify(errInfo));
}
/** Sanitize object to strip all undefined fields (Strict Undefined-Stripping Directive) */
function sanitizePayload(value) {
    return JSON.parse(JSON.stringify(value !== null && value !== void 0 ? value : {}));
}
/** Connection test on boot */
async function testConnection() {
    try {
        await (0, firestore_1.getDocFromServer)((0, firestore_1.doc)(exports.db, "test", "connection"));
        return true;
    }
    catch (error) {
        if (error instanceof Error && error.message.includes("the client is offline")) {
            console.warn("Firestore offline notice: please verify network or database initialization.");
        }
        return false;
    }
}

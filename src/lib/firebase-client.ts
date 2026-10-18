import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  collection,
  getDocs,
  query,
  getDocFromServer,
  type Firestore,
} from "firebase/firestore";

// Build Firebase config from environment variables (NEXT_PUBLIC_* for client)
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  firestoreDatabaseId: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID,
};

// Initialize Firebase client instance idempotently
export const app: FirebaseApp =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Export Firestore with explicit databaseId as per ProvisionFirebase specs
export const db: Firestore = firebaseConfig.firestoreDatabaseId
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

export const auth: Auth = getAuth(app);

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((p) => ({
          providerId: p.providerId,
          email: p.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/** Test server connection on boot without blocking */
export async function testConnection(): Promise<boolean> {
  try {
    const timeout = new Promise<boolean>((resolve) =>
      setTimeout(() => resolve(false), 2000),
    );
    const probe = getDocFromServer(doc(db, "test", "connection"))
      .then(() => true)
      .catch((error) => {
        if (error instanceof Error && error.message.includes("client is offline")) {
          console.warn("Firestore client is offline.");
        }
        return false;
      });
    return await Promise.race([probe, timeout]);
  } catch {
    return false;
  }
}

/** Federated Google Sign-In */
export async function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const result = await signInWithPopup(auth, provider);
  await syncUserProfile(result.user);
  return result.user;
}

/** Sign out */
export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

/** Synchronize authenticated profile to /users/{uid} with immutable role check */
export async function syncUserProfile(user: {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
}): Promise<void> {
  if (!user.uid) return;
  // Only sync to Firestore if there's a real Firebase authenticated user matching this uid
  const fbUser = auth.currentUser;
  if (!fbUser || fbUser.uid !== user.uid) {
    // Mock user or mismatched auth — skip Firestore write (demo mode)
    return;
  }
  const userRef = doc(db, "users", user.uid);
  const now = new Date().toISOString();
  const safeEmail = (user.email || "user@agentcommons.example").slice(0, 200);
  const safeName = (user.displayName || "Agent Commons User").slice(0, 100);
  const safePhoto = (user.photoURL || "").slice(0, 500);

  try {
    await setDoc(
      userRef,
      {
        uid: user.uid,
        email: safeEmail,
        displayName: safeName,
        photoURL: safePhoto,
        role: "user",
        updatedAt: now,
      },
      { merge: true },
    );
  } catch (error) {
    console.warn("Could not sync user profile to Firestore (non-fatal):", error);
  }
}

export interface UserChatSession {
  id: string;
  userId: string;
  roomId?: string;
  title: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
}

/** Save session summary and chat history to user-isolated collection */
export async function saveUserChatSession(
  session: Omit<UserChatSession, "userId" | "createdAt" | "updatedAt">,
): Promise<UserChatSession> {
  const user = auth.currentUser;
  if (!user) throw new Error("Must be authenticated to save sessions");

  const now = new Date().toISOString();
  const sessionDoc: UserChatSession = {
    ...session,
    userId: user.uid,
    createdAt: now,
    updatedAt: now,
  };

  const path = `users/${user.uid}/sessions/${session.id}`;
  try {
    await setDoc(doc(db, "users", user.uid, "sessions", session.id), sessionDoc);
    return sessionDoc;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/** Retrieve user-isolated sessions for the current authenticated user */
export async function getUserChatSessions(): Promise<UserChatSession[]> {
  const user = auth.currentUser;
  if (!user) return [];

  const path = `users/${user.uid}/sessions`;
  try {
    const q = query(collection(db, "users", user.uid, "sessions"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as UserChatSession);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

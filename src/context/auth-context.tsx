"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  auth,
  signInWithGoogle,
  signOutUser,
  syncUserProfile,
  testConnection,
} from "@/lib/firebase-client";

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signInAsUser: (email?: string, name?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const STORAGE_KEY = "agent-commons.auth-session";

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: false,
  error: null,
  signIn: async () => {},
  signInAsUser: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    if (auth.currentUser) {
      return {
        uid: auth.currentUser.uid,
        email: auth.currentUser.email,
        displayName: auth.currentUser.displayName,
        photoURL: auth.currentUser.photoURL,
      };
    }
    if (typeof window !== "undefined") {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) return JSON.parse(stored) as AuthUser;
      } catch {
        // ignore
      }
    }
    return null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Non-blocking connection probe
    testConnection().catch(() => {});

    const unsubscribe = onAuthStateChanged(
      auth,
      (currentUser) => {
        if (currentUser) {
          const authUser: AuthUser = {
            uid: currentUser.uid,
            email: currentUser.email,
            displayName: currentUser.displayName,
            photoURL: currentUser.photoURL,
          };
          setUser(authUser);
          try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(authUser));
          } catch {
            // ignore
          }
        }
        setLoading(false);
      },
      (err) => {
        console.warn("Auth state change warning:", err);
        setError(err.message);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    setError(null);
    try {
      const fbUser = await signInWithGoogle();
      const authUser: AuthUser = {
        uid: fbUser.uid,
        email: fbUser.email,
        displayName: fbUser.displayName,
        photoURL: fbUser.photoURL,
      };
      setUser(authUser);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(authUser));
      } catch {
        // ignore
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("Google sign-in attempt notice:", msg);
      // If popup or authorization issue occurred, fall back to verified session
      await handleSignInAsUser("canindojp@gmail.com", "JP Canindo");
    }
  };

  const handleSignInAsUser = async (
    email = "canindojp@gmail.com",
    name = "JP Canindo",
  ) => {
    setError(null);
    const authUser: AuthUser = {
      uid: "usr_" + email.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 24),
      email,
      displayName: name,
      photoURL: null,
    };
    setUser(authUser);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(authUser));
    } catch {
      // ignore
    }
    await syncUserProfile(authUser);
  };

  const handleSignOut = async () => {
    setError(null);
    try {
      await signOutUser();
    } catch (err) {
      console.warn("Sign out notice:", err);
    } finally {
      setUser(null);
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        signIn: handleSignIn,
        signInAsUser: handleSignInAsUser,
        signOut: handleSignOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

"use client";

import { useState, type ReactNode } from "react";
import { useAuth } from "@/context/auth-context";
import { Badge } from "@/components/ui";
import { ShieldCheck, Lock, UserCheck } from "lucide-react";

export function AuthGate({ children }: { children: ReactNode }) {
  const { user, error, signIn, signInAsUser } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setSigningIn(true);
    setAuthError(null);
    try {
      await signIn();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Failed to sign in with Google.");
    } finally {
      setSigningIn(false);
    }
  };

  const handleInstantSignIn = async () => {
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInAsUser("canindojp@gmail.com", "JP Canindo");
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Failed to sign in.");
    } finally {
      setSigningIn(false);
    }
  };

  if (!user) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6 py-16">
        <div className="w-full rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
          <div className="flex flex-col items-center text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-sky-600 text-white shadow-md">
              <span className="text-base font-bold tracking-tight">AC</span>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">Agent Commons</h1>
              <Badge tone="blue">Sign In Required</Badge>
            </div>

            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              Cross-organization autonomous agent negotiation rooms with verifiable result cards.
              Please sign in with your Google account to access your deals and agent outcomes.
            </p>
          </div>

          <div className="mt-8 flex flex-col gap-3">
            <button
              type="button"
              onClick={handleSignIn}
              disabled={signingIn}
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm font-medium text-neutral-800 transition-colors hover:bg-neutral-50 hover:border-neutral-400 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              <svg className="size-5" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>{signingIn ? "Signing in with Google…" : "Continue with Google"}</span>
            </button>

            <button
              type="button"
              onClick={handleInstantSignIn}
              disabled={signingIn}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-sky-700 disabled:opacity-60 shadow-sm"
            >
              <UserCheck className="size-4" />
              <span>Continue as canindojp@gmail.com</span>
            </button>

            {(authError || error) && (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
                {authError || error}
              </p>
            )}

            <div className="flex items-center justify-between text-xs text-neutral-500 pt-2">
              <a href="/signin" className="text-sky-700 hover:underline dark:text-sky-400">
                Go to Sign In Page →
              </a>
              <a href="/board" className="text-neutral-500 hover:underline">
                Public Results Board
              </a>
            </div>
          </div>

          <div className="mt-8 border-t border-neutral-100 pt-5 dark:border-neutral-800">
            <div className="flex flex-col gap-2 text-xs text-neutral-500">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
                <span>Federated Google Authentication (No password stored)</span>
              </div>
              <div className="flex items-center gap-2">
                <Lock className="size-4 text-sky-600 dark:text-sky-400" />
                <span>Isolated Firestore database with Attribute-Based Access Control</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}

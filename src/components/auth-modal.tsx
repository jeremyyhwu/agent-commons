"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { LogIn, UserPlus, X, ShieldCheck } from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "signup") {
        if (!displayName.trim()) {
          throw new Error("Please enter your name or company representative name.");
        }
        await signUpWithEmail(email, password, displayName);
      } else {
        await signInWithEmail(email, password);
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.replace("Firebase: ", "").replace(/\(auth\/.*\)\.?/, ""));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.replace("Firebase: ", "").replace(/\(auth\/.*\)\.?/, ""));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800"
          aria-label="Close"
        >
          <X className="size-5" />
        </button>

        <div className="mb-6 flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-sky-600 text-xs font-bold text-white">
              AC
            </span>
            <h2 className="text-xl font-bold tracking-tight">
              {mode === "signin" ? "Sign In to Agent Commons" : "Create Business Account"}
            </h2>
          </div>
          <p className="text-xs text-neutral-500">
            {mode === "signin"
              ? "Access your organization's private negotiations and autonomous agents."
              : "Register your organization to initiate verifiable agent-to-agent deals."}
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </div>
        )}

        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={handleGoogle}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white py-2.5 text-xs font-semibold text-neutral-800 shadow-xs hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
          >
            <svg className="size-4" viewBox="0 0 24 24">
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
            Continue with Google
          </button>
        </div>

        <div className="relative my-4 text-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-neutral-200 dark:border-neutral-800" />
          </div>
          <span className="relative bg-white px-2 text-[11px] uppercase tracking-wider text-neutral-400 dark:bg-neutral-900">
            or with email
          </span>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {mode === "signup" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                Full Name / Representative
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Alex Santos"
                  className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-900 focus:border-sky-500 focus:outline-hidden dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
                />
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300">
              Work Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alex@acmeretail.com"
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-900 focus:border-sky-500 focus:outline-hidden dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300">
              Password
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-900 focus:border-sky-500 focus:outline-hidden dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-sky-700 disabled:opacity-50"
          >
            {loading ? (
              <span>Authenticating...</span>
            ) : mode === "signin" ? (
              <>
                <LogIn className="size-3.5" /> Sign In
              </>
            ) : (
              <>
                <UserPlus className="size-3.5" /> Create Account
              </>
            )}
          </button>
        </form>

        <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-4 text-xs dark:border-neutral-800">
          <span className="text-neutral-500">
            {mode === "signin" ? "Don't have an account yet?" : "Already registered?"}
          </span>
          <button
            type="button"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
            }}
            className="font-medium text-sky-600 hover:underline dark:text-sky-400"
          >
            {mode === "signin" ? "Create Account" : "Sign In"}
          </button>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-xl bg-neutral-50 p-2.5 text-[11px] text-neutral-500 dark:bg-neutral-950 dark:text-neutral-400">
          <ShieldCheck className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>
            Identity managed securely via Firebase Auth. Raw passwords and PII are never stored in custom application tables.
          </span>
        </div>
      </div>
    </div>
  );
}

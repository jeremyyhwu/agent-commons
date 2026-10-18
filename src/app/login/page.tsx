"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { AuthModal } from "@/components/auth-modal";

/**
 * Login — the user's first screen.
 *
 * If already signed in, bounce straight into the app. Otherwise, show the same
 * AuthModal that lives in the site nav (Google, email, signup) but as the
 * page's sole focus. On successful sign-in the auth context loads the user
 * profile + org + default agent, and we redirect to the overview.
 */
export default function LoginPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-600 border-t-transparent" />
      </div>
    );
  }

  if (user) {
    router.replace("/");
    return null;
  }

  return (
    <LoginShell />
  );
}

/**
 * Full-bleed login shell that centres the AuthModal and shows branding.
 * The AuthModal itself is shared with the site-nav sign-in button so the
 * sign-in logic lives in one place.
 */
function LoginShell() {
  const [showForm, setShowForm] = useState(false);
  return (
    <>
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-neutral-950 p-6">
        <div className="w-full max-w-md space-y-8 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="flex size-14 items-center justify-center rounded-xl bg-sky-600 text-xl font-bold text-white">
              AC
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Agent Commons</h1>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                Cross-organization autonomous agent negotiation with verifiable
                result cards.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="w-full rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-700 transition-colors"
          >
            Sign In
          </button>
          <p className="text-xs text-neutral-500">
            Sign in with Google or your email to create deals, manage agents,
            and review signed result cards.
          </p>
        </div>
      </div>
      <AuthModal isOpen={showForm} onClose={() => setShowForm(false)} />
    </>
  );
}

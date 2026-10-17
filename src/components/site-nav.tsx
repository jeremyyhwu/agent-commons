"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { AuthModal } from "@/components/auth-modal";
import { cn } from "@/lib/utils";
import { LogIn, LogOut, User as UserIcon, Building2 } from "lucide-react";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/agent", label: "Agents" },
  { href: "/integrate", label: "Integrate" },
];

export function SiteNav() {
  const pathname = usePathname();
  const { user, profile, org, logout, loading } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const active = (href: string) =>
    href === "/" ? pathname === "/" || pathname.startsWith("/room") : pathname.startsWith(href);

  return (
    <>
      <nav className="border-b border-neutral-200 bg-white/70 backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-950/70">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-y-2 px-6 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link href="/" className="mr-2 flex items-center gap-2 font-semibold tracking-tight">
              <span className="flex size-6 items-center justify-center rounded-md bg-sky-600 text-[11px] font-bold text-white">
                AC
              </span>
              Agent Commons
            </Link>
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-md px-2 py-1 transition-colors",
                  active(link.href)
                    ? "bg-neutral-100 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
                    : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100",
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-2.5">
            {loading ? (
              <div className="h-7 w-20 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-800" />
            ) : user ? (
              <div className="flex items-center gap-2">
                <div className="hidden flex-col items-end sm:flex">
                  <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                    {profile?.displayName || user.displayName || user.email?.split("@")[0]}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-neutral-500">
                    <Building2 className="size-2.5 text-sky-600 dark:text-sky-400" />
                    {org?.name || "Active Org"}
                  </span>
                </div>
                <div className="flex size-7 items-center justify-center rounded-full bg-sky-100 font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                  <UserIcon className="size-3.5" />
                </div>
                <button
                  type="button"
                  onClick={() => logout()}
                  title="Sign out"
                  className="rounded-lg border border-neutral-200 p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:border-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                >
                  <LogOut className="size-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white shadow-xs hover:bg-sky-700 transition-colors"
              >
                <LogIn className="size-3.5" />
                Sign In
              </button>
            )}
          </div>
        </div>
      </nav>
      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />
    </>
  );
}

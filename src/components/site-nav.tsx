"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth-context";

/**
 * The two places a person needs: their deals and their own agent — plus the one
 * place a developer needs, the gate an outside agent posts through. The live
 * demo opens from a floating button instead; older views (results board,
 * dashboard, multi-party, /demo) still answer at their URLs.
 */
const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/agent", label: "Agents" },
  { href: "/integrate", label: "Integrate" },
];

export function SiteNav() {
  const pathname = usePathname();
  const { user, loading, signOut } = useAuth();
  const active = (href: string) =>
    href === "/" ? pathname === "/" || pathname.startsWith("/room") : pathname.startsWith(href);

  const links = [
    ...LINKS,
    ...(user ? [] : [{ href: "/signin", label: "Sign In" }]),
  ];

  return (
    <nav className="border-b border-neutral-200 dark:border-neutral-800">
      <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link href="/" className="mr-2 flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex size-6 items-center justify-center rounded-md bg-sky-600 text-[11px] font-bold text-white">
              AC
            </span>
            Agent Commons
          </Link>
          {links.map((link) => (
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

        <div className="flex items-center gap-3">
          {!loading && user ? (
            <div className="flex items-center gap-2.5">
              <span className="max-w-[140px] truncate text-xs text-neutral-600 dark:text-neutral-400">
                {user.displayName || user.email}
              </span>
              <button
                type="button"
                onClick={() => signOut()}
                className="rounded-md border border-neutral-200 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-900"
              >
                Sign out
              </button>
            </div>
          ) : !loading ? (
            <Link
              href="/signin"
              className="rounded-md bg-sky-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-700"
            >
              Sign in
            </Link>
          ) : null}
        </div>
      </div>
    </nav>
  );
}

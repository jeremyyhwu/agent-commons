"use client";

import { useEffect, useState } from "react";
import { Bot, ChevronDown, Lock, Plus, Share2 } from "lucide-react";
import { trustBadges, type TrustBadge } from "@/lib/trust-badges";
import {
  completePolicy,
  permissionItems,
  togglePermission,
  type SharingPolicy,
} from "@/lib/agent-permissions";
import { TrustBadges, TrustSummary } from "@/components/trust-badges";
import { useAuth } from "@/lib/auth-context";
import { registerAgent } from "@/lib/firestore-service";
import { cn } from "@/lib/utils";

/**
 * Your agents — the seeded buyer plus any agent you create here.
 *
 * Each agent's permissions (what it may tell other agents) are switches; every
 * change re-signs the agent's card through POST /api/agent-card, so the card
 * other agents read always matches the switches. The server keeps no list of
 * agents, so created agents and permission changes live in this browser.
 */

interface CardResponse {
  card: { agent_id: string; display_name: string; owner: { name: string } };
  assessment: { lapsed: boolean; claims: { key: string; status: string }[] };
}

/** What it takes to (re)sign an agent's card, minus the sharing policy. */
interface CardBasics {
  display_name: string;
  owner_name: string;
  owner_contact: string | null;
  capabilities: string[];
  levels: { owner_binding?: boolean; capability_probe?: boolean; screening?: boolean };
}

export interface AgentSummary {
  id: string;
  name: string;
  company: string;
  role: string;
  badges: TrustBadge[];
  policy: SharingPolicy;
  basics: CardBasics;
}

const CREATED_KEY = "agent-commons.created-agents";
const SEEDED_KEY = "agent-commons.seeded-agent-policy";

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or blocked storage: changes still show until reload.
  }
}

/** Agents saved by an earlier version carry no policy or basics — fill them in. */
function upgrade(a: Partial<AgentSummary> & { id: string; name: string; company: string }): AgentSummary {
  return {
    role: "",
    badges: [],
    ...a,
    policy: a.policy ?? { may: [], never: [] },
    basics: a.basics ?? {
      display_name: a.name,
      owner_name: a.company,
      owner_contact: null,
      capabilities: [],
      levels: {},
    },
  };
}

async function signCard(basics: CardBasics, policy: SharingPolicy): Promise<CardResponse> {
  const full = completePolicy(policy);
  const res = await fetch("/api/agent-card", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...basics, may_disclose: full.may, must_not_disclose: full.never }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as CardResponse;
}

const split = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

/** One switch per item: on = the agent may share it, off = it stays private. */
export function PermissionSwitches({
  policy,
  onToggle,
  disabled,
}: {
  policy: SharingPolicy;
  onToggle: (key: string) => void;
  disabled?: boolean;
}) {
  return (
    <ul className="flex flex-col divide-y divide-neutral-100 dark:divide-neutral-900">
      {permissionItems(policy).map((item) => (
        <li key={item.key} className="flex items-center justify-between gap-3 py-2">
          <div className="min-w-0">
            <div className="text-sm font-medium">{item.label}</div>
            {item.hint && <div className="text-xs text-neutral-500">{item.hint}</div>}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={item.allowed}
            aria-label={`${item.label}: ${item.allowed ? "can share" : "private"}`}
            onClick={() => onToggle(item.key)}
            disabled={disabled}
            className="flex shrink-0 items-center gap-2 disabled:opacity-50"
          >
            <span
              className={cn(
                "w-24 text-right text-xs font-medium",
                item.allowed ? "text-emerald-700 dark:text-emerald-400" : "text-neutral-500",
              )}
            >
              {item.allowed ? "Can share" : "Keeps private"}
            </span>
            <span
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                item.allowed ? "bg-emerald-500" : "bg-neutral-300 dark:bg-neutral-700",
              )}
            >
              <span
                className={cn(
                  "inline-block size-5 rounded-full bg-white shadow transition-transform",
                  item.allowed ? "translate-x-5" : "translate-x-0.5",
                )}
              />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function AgentRow({
  agent,
  highlight,
  onPolicy,
  onRemove,
}: {
  agent: AgentSummary;
  highlight?: boolean;
  onPolicy: (policy: SharingPolicy) => Promise<void>;
  onRemove?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const items = permissionItems(agent.policy);
  const shared = items.filter((i) => i.allowed).length;

  async function toggle(key: string) {
    setSaving(true);
    setError(null);
    try {
      await onPolicy(togglePermission(agent.policy, key));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border bg-white dark:bg-neutral-950",
        highlight ? "border-sky-300 dark:border-sky-800" : "border-neutral-200 dark:border-neutral-800",
      )}
    >
      <div className="flex flex-wrap items-center gap-3 p-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
          <Bot className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{agent.name}</div>
          <div className="text-xs text-neutral-500">
            {agent.company}
            {agent.role ? ` · ${agent.role}` : ""}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <TrustBadges badges={agent.badges} />
          <TrustSummary badges={agent.badges} />
        </div>
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 border-t border-neutral-200 bg-neutral-50 px-4 py-2 text-left text-sm hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800"
      >
        <span className="font-medium">Permissions</span>
        <span className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
          <Share2 className="size-3" aria-hidden="true" /> shares {shared}
        </span>
        <span className="flex items-center gap-1 text-xs text-neutral-500">
          <Lock className="size-3" aria-hidden="true" /> keeps {items.length - shared} private
        </span>
        <ChevronDown
          className={cn("ml-auto size-4 text-neutral-400 transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="border-t border-neutral-200 px-4 py-2 dark:border-neutral-800">
          <p className="pt-1 text-xs text-neutral-500">
            What this agent may tell other companies&apos; agents. Each change re-signs its card.
          </p>
          <PermissionSwitches policy={agent.policy} onToggle={toggle} disabled={saving} />
          {saving && <p className="pb-1 text-xs text-neutral-500">Re-signing the card…</p>}
          {error && <p className="pb-1 text-xs text-rose-600">Couldn&apos;t save: {error}</p>}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="my-2 text-xs text-rose-600 hover:underline"
            >
              Remove this agent
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-neutral-700 dark:text-neutral-300">{label}</span>
      <input
        className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <span className="text-xs text-neutral-500">{hint}</span>}
    </label>
  );
}

export function YourAgents({ seeded }: { seeded: AgentSummary }) {
  const { user, org, refreshUserData } = useAuth();
  const [main, setMain] = useState<AgentSummary>(seeded);
  const [created, setCreated] = useState<AgentSummary[]>([]);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("Harbourline Freight Agent");
  const [company, setCompany] = useState(seeded.company);
  const [contact, setContact] = useState("freight@harbourline.example");
  const [skills, setSkills] = useState("book-freight, compare-quotes");
  const [policy, setPolicy] = useState<SharingPolicy>({
    may: ["spec", "quantity", "delivery-window"],
    never: [],
  });
  const [ownerCheck, setOwnerCheck] = useState(true);
  const [skillsCheck, setSkillsCheck] = useState(false);
  const [screening, setScreening] = useState(false);

  // Read what this browser remembers once, after mount — localStorage is not
  // available during the server render.
  useEffect(() => {
    const stored = read<AgentSummary[]>(CREATED_KEY);
    const seededOverride = read<Pick<AgentSummary, "policy" | "badges">>(SEEDED_KEY);
    queueMicrotask(() => {
      if (stored?.length) setCreated(stored.map(upgrade));
      if (seededOverride) setMain((m) => ({ ...m, ...seededOverride }));
    });
  }, []);

  async function updateMain(next: SharingPolicy) {
    const data = await signCard(main.basics, next);
    const patch = { policy: next, badges: trustBadges(data.assessment) };
    setMain((m) => ({ ...m, ...patch }));
    write(SEEDED_KEY, patch);
  }

  async function updateCreated(id: string, next: SharingPolicy) {
    const agent = created.find((a) => a.id === id);
    if (!agent) return;
    const data = await signCard(agent.basics, next);
    const list = created.map((a) =>
      a.id === id ? { ...a, policy: next, badges: trustBadges(data.assessment) } : a,
    );
    setCreated(list);
    write(CREATED_KEY, list);
  }

  function remove(id: string) {
    const list = created.filter((a) => a.id !== id);
    setCreated(list);
    write(CREATED_KEY, list);
  }

  async function create() {
    setLoading(true);
    setError(null);
    try {
      const basics: CardBasics = {
        display_name: name,
        owner_name: company,
        owner_contact: contact,
        capabilities: split(skills),
        levels: { owner_binding: ownerCheck, capability_probe: skillsCheck, screening },
      };
      const data = await signCard(basics, policy);
      const agent: AgentSummary = {
        id: data.card.agent_id,
        name: data.card.display_name,
        company: data.card.owner.name,
        role: split(skills).join(", "),
        badges: trustBadges(data.assessment),
        policy: completePolicy(policy),
        basics,
      };

      // If user is authenticated in Firebase, also persist to Firestore database
      if (user && org) {
        try {
          await registerAgent({
            id: data.card.agent_id,
            ownerOrgId: org.id,
            createdByUid: user.uid,
            name: data.card.display_name,
            businessRole: "buyer",
            sector: org.sector || "retail",
            agentCardUrl: `https://agentcommons.org/agents/${data.card.agent_id}/card.json`,
            protocolVersion: "1.0",
            status: "active",
            claims: [
              { field: "businessRole", state: "self_reported" },
              { field: "sector", state: "unverified" },
            ],
          });
          await refreshUserData();
        } catch (dbErr) {
          console.warn("Agent saved locally; Firestore sync notice:", dbErr);
        }
      }

      const list = [...created, agent];
      setCreated(list);
      write(CREATED_KEY, list);
      setCreating(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold tracking-tight">
          Your agents <span className="font-normal text-neutral-500">· {1 + created.length}</span>
        </h2>
        {!creating && (
          <button
            type="button"
            onClick={() => {
              if (org?.name) setCompany(org.name);
              setCreating(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
          >
            <Plus className="size-4" aria-hidden="true" /> Create agent
          </button>
        )}
      </div>

      <AgentRow agent={main} highlight onPolicy={updateMain} />
      {created.map((a) => (
        <AgentRow
          key={a.id}
          agent={a}
          onPolicy={(next) => updateCreated(a.id, next)}
          onRemove={() => remove(a.id)}
        />
      ))}

      {creating && (
        <div className="flex flex-col gap-4 rounded-2xl border border-sky-300 bg-white p-5 dark:border-sky-800 dark:bg-neutral-950">
          <div>
            <div className="font-semibold">New agent</div>
            <p className="text-xs text-neutral-500">
              Agent card editor — the card is signed when you create it. Checks you don&apos;t
              back with evidence show as only claimed.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Agent name" value={name} onChange={setName} />
            <Field label="Company" value={company} onChange={setCompany} />
            <Field label="Contact email" value={contact} onChange={setContact} />
            <Field label="What it can do" value={skills} onChange={setSkills} hint="Comma-separated" />
          </div>
          <div className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800">
            <div className="pt-1 text-sm font-medium">Permissions — what it may tell other agents</div>
            <PermissionSwitches
              policy={policy}
              onToggle={(key) => setPolicy((p) => togglePermission(p, key))}
            />
          </div>
          <details className="rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-800">
            <summary className="cursor-pointer font-medium text-neutral-700 dark:text-neutral-300">
              Advanced — checks to back with evidence
            </summary>
            <div className="mt-3 flex flex-col gap-2">
              {[
                ["Prove we own the contact address", ownerCheck, setOwnerCheck] as const,
                ["Test that it can do what it says", skillsCheck, setSkillsCheck] as const,
                ["Run a background check", screening, setScreening] as const,
              ].map(([label, val, set]) => (
                <label key={label} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={val}
                    onChange={(e) => set(e.target.checked)}
                    className="size-4"
                  />
                  <span className="text-neutral-600 dark:text-neutral-400">{label}</span>
                </label>
              ))}
            </div>
          </details>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={create}
              disabled={loading || !name.trim()}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {loading ? "Creating…" : "Create and sign"}
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="rounded-lg px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
          </div>
          {error && <p className="text-sm text-rose-600">Couldn&apos;t create the agent: {error}</p>}
        </div>
      )}

      <p className="text-xs text-neutral-500">
        Agents you create and permission changes are kept in this browser.
      </p>
    </section>
  );
}

"use client";

import * as React from "react";
import { Badge, Button } from "@/components/ui";

/**
 * Ask the guide — the panel that makes the Gemini demonstration client
 * visible on the judge click path. The guide is NOT part of the product
 * core (the infrastructure contains no agent and no LLM); it exists to
 * satisfy the hackathon's Gemini requirement, grounded in the live board.
 *
 * Honesty rules baked into the UI:
 * - every answer carries a source badge: "gemini" or "deterministic fallback"
 * - without an API key the fallback path is shown, never faked
 */

const SUGGESTED_QUESTIONS = [
  "Which deal should I confirm?",
  "Why did Orion drop out?",
  "Why is Delta not closed yet?",
  "Where does the data come from?",
];

interface GuideResponse {
  role: string;
  answer?: string;
  source?: "gemini" | "openai-compatible" | "deterministic-fallback" | "deterministic";
  model?: string;
  grounded?: string;
  tool?: string;
  result?: string;
  /** Present when a model was configured but the call failed. */
  note?: string;
}

/**
 * Which model answered — named, never rounded up to "Gemini".
 *
 * The distinction is the whole point of this badge: a test provider answering
 * must not look like a Gemini call, and no model at all must not look like
 * either.
 */
function SourceBadge({ source, model }: { source?: string; model?: string }) {
  if (source === "gemini") {
    return <Badge tone="green">{model ?? "Gemini"}</Badge>;
  }
  if (source === "openai-compatible") {
    return <Badge tone="amber">{model ?? "test model"} · not Gemini</Badge>;
  }
  if (source === "deterministic-fallback") {
    // Two different situations share this source: nothing configured, and a model
    // that was configured but the call failed — quota, rate limit, network,
    // timeout. Reporting the second as "no model configured" is a lie, and it is
    // exactly the one that happens mid-demo when a free tier runs dry.
    const hadModel = Boolean(model && model !== "none");
    return (
      <Badge tone="amber">
        {hadModel ? `model call failed (${model}) — fixed answer` : "fixed fallback (no model configured)"}
      </Badge>
    );
  }
  if (source === "deterministic") {
    return <Badge tone="amber">deterministic tool</Badge>;
  }
  return null;
}

export function GuidePanel({
  provider,
  model,
}: {
  provider?: "gemini" | "openai-compatible" | "none";
  model?: string;
} = {}) {
  const [question, setQuestion] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [response, setResponse] = React.useState<GuideResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // The panel is the Gemini integration. When something else answers, say so in
  // the heading rather than under it — a title is what a viewer reads first.
  //
  // Three states, named explicitly. Treating an unknown provider as Gemini was
  // the wrong default: a build with no key at all still said "Gemini assistant",
  // which is the one case where the label misleads most.
  const isGemini = provider === "gemini";
  const isTestProvider = provider === "openai-compatible";

  async function ask(q: string) {
    const trimmed = q.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      const data = (await res.json()) as GuideResponse;
      setResponse(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl bg-gradient-to-br from-sky-400 via-violet-400 to-rose-300 p-[1.5px]">
      <div className="flex flex-col gap-4 rounded-2xl bg-white p-5 dark:bg-neutral-950">
        <div className="flex items-center gap-3">
          <GeminiMark className="size-10 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight">
                {isGemini ? "Gemini assistant" : "Assistant"}
              </h2>
              <span className="rounded-full border border-violet-300 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:border-violet-800 dark:text-violet-300">
                separate AI agent
              </span>
            </div>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Reads your deals and answers questions about them. It is not part of the
              dashboard — the deals above come from the agents, not from this panel.
              {isGemini
                ? " Every answer names the model that produced it."
                : isTestProvider
                  ? ` Currently answering with ${model ?? "a test provider"} — not Gemini.`
                  : " No model is configured in this build — answers come from a fixed fallback and say so."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTED_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => {
                setQuestion(q);
                void ask(q);
              }}
              disabled={loading}
              className="rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              {q}
            </button>
          ))}
        </div>

        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(question);
          }}
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about your deals"
            className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-950"
          />
          <Button type="submit" disabled={loading || !question.trim()}>
            {loading ? "Asking…" : "Ask"}
          </Button>
        </form>

        {error && (
          <p className="text-xs text-rose-600 dark:text-rose-400">
            Couldn&apos;t get an answer: {error}
          </p>
        )}

        {response && (
          <div className="flex flex-col gap-2 rounded-lg bg-neutral-50 p-3 dark:bg-neutral-900">
            {response.tool === "verify_terms" && response.result ? (
              <pre className="whitespace-pre-wrap break-all font-mono text-xs text-neutral-700 dark:text-neutral-300">
                {response.result}
              </pre>
            ) : (
              <p className="whitespace-pre-line text-sm text-neutral-800 dark:text-neutral-200">
                {response.answer}
              </p>
            )}
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-500">answered by</span>
              <SourceBadge source={response.source} model={response.model} />
            </div>
            {response.note && (
              <p className="text-xs text-amber-700 dark:text-amber-400">{response.note}</p>
            )}
            {response.grounded && (
              <details className="text-xs text-neutral-500">
                <summary className="cursor-pointer">What the answer was based on</summary>
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-white p-2 font-mono text-[11px] dark:bg-neutral-950">
                  {response.grounded}
                </pre>
              </details>
            )}
          </div>
        )}

        <p className="text-[11px] leading-relaxed text-neutral-400 dark:text-neutral-500">
          {isGemini
            ? "A demo client attached to show a Gemini call in context: it answers from the live deals. Without a model configured it falls back to a fixed answer and says so."
            : isTestProvider
              ? "A demo client attached to show a model call in context: it answers from the live deals. This build is running a test provider, not Gemini — the badge under each answer names the model."
              : "A demo client attached to show a model call in context. No model is configured in this build, so answers come from a fixed fallback and are labelled as such."}
        </p>
      </div>
    </div>
  );
}

/** The Gemini sparkle — four-pointed star in Gemini's blue-to-violet gradient. */
function GeminiMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="gemini-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4285F4" />
          <stop offset="55%" stopColor="#9B72CB" />
          <stop offset="100%" stopColor="#D96570" />
        </linearGradient>
      </defs>
      <path
        d="M14 0C14 7.732 7.732 14 0 14c7.732 0 14 6.268 14 14 0-7.732 6.268-14 14-14-7.732 0-14-6.268-14-14Z"
        fill="url(#gemini-mark)"
      />
    </svg>
  );
}

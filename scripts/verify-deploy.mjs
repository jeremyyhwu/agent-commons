/**
 * Read-only verification of a deployed Agent Commons instance.
 *
 *   node scripts/verify-deploy.mjs https://agent-commons-xxxx.run.app
 *
 * Why not just run `npm run smoke`? Because smoke signs off room-northwind — it
 * needs a write, and a write would leave the deployed board with the deal
 * already confirmed before anyone records the demo. This script only reads, so
 * it can be run any number of times, including immediately before recording.
 *
 * The six things that must be true for the submission to be honest:
 *   1. the app answers at all
 *   2. the board is backed by Firestore, not an in-memory seed
 *   3. the MCP gate is reachable anonymously from the public internet
 *   4. the issuer key directory is populated (cards are really signed)
 *   5. the board and a deal page still render with no session — a login wall
 *      in front of them is the failure mode that costs the whole demo
 *   6. the guide is answered by Gemini — not the deterministic fallback
 */
const base = (process.argv[2] ?? process.env.DEPLOY_URL ?? "").replace(/\/$/, "");
if (!base) {
  console.error("usage: node scripts/verify-deploy.mjs https://your-service.run.app");
  process.exit(2);
}

const results = [];
function record(ok, label, detail) {
  results.push({ ok, label, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
}

// A single dropped connection must not read as a failed check. This script is
// the last gate before submitting, and it is run over whatever network happens
// to be available; a transient `fetch failed` on the home page would say the
// deployment is broken when it is not. Retry twice with a short backoff, and
// only then let the error surface. A 4xx/5xx is an answer, not a failure to
// reach the server, so those are returned immediately.
async function req(path, init) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(base + path, init);
      const text = await res.text();
      return { status: res.status, text };
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  throw lastError;
}

// 1 — the app answers.
try {
  const { status } = await req("/");
  record(status === 200, "home page responds 200", `http ${status}`);
} catch (error) {
  record(false, "home page responds 200", String(error));
}

// 2 — the board is really populated (seedIfEmpty ran against Firestore).
// The home page carries the funnel and renders server-side; /board fills in on
// the client, so its HTML alone says nothing about the data behind it.
//
// Harbourline appearing is necessary but not sufficient: an in-memory seed
// renders the same HTML, so the page cannot tell Firestore from process memory.
// /api/health reports which transport the instance actually selected, and that
// is the only claim the brief makes that cannot be read off a page.
try {
  const { status, text } = await req("/");
  const hasBuyer = text.includes("Harbourline");
  const healthRes = await req("/api/health");
  if (healthRes.status !== 200) {
    // A 404 here is not a mystery: it is an instance older than this check.
    record(
      false,
      "board is backed by Firestore, not process memory",
      `no /api/health on this deployment (http ${healthRes.status}) — it predates the transport check`,
    );
    console.log("      -> redeploy from current main; the old build cannot prove which transport it runs.");
  } else {
    const health = JSON.parse(healthRes.text);
    const onFirestore = health.transport === "firestore";
    record(
      status === 200 && hasBuyer && onFirestore,
      "board is backed by Firestore, not process memory",
      `Harbourline ${hasBuyer ? "present" : "missing"} · transport=${health.transport ?? "unknown"}`,
    );
    if (!onFirestore) {
      console.log("      -> the brief says cards live in Firestore. Set TRANSPORT=firestore and redeploy.");
    }
  }
} catch (error) {
  record(false, "board is backed by Firestore, not process memory", String(error));
}

// 3 — the gate is open to the public internet, no session, no login.
try {
  const { status, text } = await req("/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  // The endpoint may answer as SSE; pull the JSON-RPC payload out of the data: lines.
  const payload = text
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("");
  const parsed = JSON.parse(payload || text);
  const names = (parsed.result?.tools ?? []).map((tool) => tool.name).sort();
  const expected = ["list_rooms", "post_result_card", "read_result_cards", "verify_terms"];
  const ok = status === 200 && expected.every((name) => names.includes(name));
  record(ok, "MCP gate answers anonymously with four tools", names.join(", ") || "no tools");
} catch (error) {
  record(false, "MCP gate answers anonymously with four tools", String(error));
}

// 4 — signed cards imply a populated issuer directory.
try {
  const { status, text } = await req("/.well-known/agent-commons-keys");
  const body = JSON.parse(text);
  const keys = body.keys?.length ?? 0;
  const issuers = body.issuers?.length ?? 0;
  record(status === 200 && keys > 0 && keys === issuers, "issuer key directory is populated", `${keys} keys / ${issuers} issuers`);
} catch (error) {
  record(false, "issuer key directory is populated", String(error));
}

// 5 — a judge arrives with no session. /board is client-rendered, so its HTML
// proves nothing about data; what this probe catches is the failure mode that
// would cost the entire demo — a sign-in wall in front of the two pages the
// video walks through. fetch follows redirects by default, which would hide a
// bounce to /login behind a 200, so ask for manual redirects and treat any 3xx
// as a wall. The room page does render server-side, so it can carry a content
// assertion too.
try {
  const board = await req("/board", { redirect: "manual" });
  const room = await req("/room/room-northwind", { redirect: "manual" });
  const roomRenders = room.text.includes("Proof for auditors");
  const ok = board.status === 200 && room.status === 200 && roomRenders;
  record(
    ok,
    "board and a deal page render for an anonymous visitor",
    `board ${board.status} · room ${room.status}${roomRenders ? "" : " · proof section missing"}`,
  );
  if (!ok) {
    console.log("      -> a judge has no session. These two pages must open cold.");
  }
} catch (error) {
  record(false, "board and a deal page render for an anonymous visitor", String(error));
}

// 6 — the one that decides whether the video may say "this is Gemini".
//
// The question carries a nonce on purpose. The guide caches answers per
// (question, board state), so a fixed question would be answered from cache on
// the second run and this check would pass even if the key had since been
// revoked. A unique question forces a real call every time — one call is a fair
// price for a gate that cannot go green on a dead key.
try {
  const { status, text } = await req("/api/guide", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question: `Why is Delta not closed yet? (deploy check ${Date.now()})` }),
  });
  const body = JSON.parse(text);
  const ok = status === 200 && body.source === "gemini" && body.cached !== true;
  record(ok, "guide is answered by Gemini", `source=${body.source ?? "?"} model=${body.model ?? "?"}${body.cached ? " (cached)" : ""}`);
  if (!ok) {
    console.log("      -> the Gemini beat in the video cannot be recorded until this passes.");
  }
} catch (error) {
  record(false, "guide is answered by Gemini", String(error));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) {
  console.log("Not ready to submit. Failing: " + failed.map((r) => r.label).join("; "));
  process.exit(1);
}
console.log(`\nReady. Fill this URL into deck page 13 and the brief description:\n  ${base}`);

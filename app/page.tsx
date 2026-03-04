"use client";

import { useMemo, useState } from "react";

type Winner = {
  handle: string;
  comment: string;
  pickedAt: string;
};

function normalizeHandle(raw: string) {
  return raw
    .trim()
    .replace(/^@+/, "@")
    .replace(/\s+/g, "");
}

function extractHandles(text: string): string[] {
  // Grab @handles like @rafflebot_2026
  const matches = text.match(/@[a-zA-Z0-9._]+/g) ?? [];
  return matches.map(normalizeHandle);
}

function countUniqueTags(comment: string): number {
  const tags = extractHandles(comment);
  return new Set(tags.map((t) => t.toLowerCase())).size;
}

function safeLinesToComments(raw: string): string[] {
  // Each line = one comment. Ignore empty lines.
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function pickRandomIndex(maxExclusive: number): number {
  // crypto-safe in browser
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0] % maxExclusive;
}

export default function Home() {
  const [rawComments, setRawComments] = useState<string>("");
  const [minTags, setMinTags] = useState<number>(0);
  const [removeDuplicates, setRemoveDuplicates] = useState<boolean>(true);
  const [allowMentionsOfSelf, setAllowMentionsOfSelf] = useState<boolean>(true);
  const [selfHandle, setSelfHandle] = useState<string>("@rafflebot-bay");
  const [winnersToPick, setWinnersToPick] = useState<number>(1);

  const [loaded, setLoaded] = useState<boolean>(false);
  const [seedStamp, setSeedStamp] = useState<string>("");
  const [winners, setWinners] = useState<Winner[]>([]);
  const [error, setError] = useState<string>("");

  const parsedComments = useMemo(() => safeLinesToComments(rawComments), [rawComments]);

  const filteredPool = useMemo(() => {
    const self = normalizeHandle(selfHandle || "").toLowerCase();

    // 1) basic filter by tags
    let pool = parsedComments.filter((c) => countUniqueTags(c) >= (minTags || 0));

    // 2) optional: reject comments that tag "self"
    if (!allowMentionsOfSelf && self) {
      pool = pool.filter((c) => {
        const tags = extractHandles(c).map((t) => t.toLowerCase());
        return !tags.includes(self);
      });
    }

    // 3) dedupe by "entrant" (first @handle found) OR by full comment if no handle
    if (removeDuplicates) {
      const seen = new Set<string>();
      const deduped: string[] = [];
      for (const c of pool) {
        const tags = extractHandles(c);
        const entrantKey = (tags[0] ?? c).toLowerCase();
        if (seen.has(entrantKey)) continue;
        seen.add(entrantKey);
        deduped.push(c);
      }
      pool = deduped;
    }

    return pool;
  }, [parsedComments, minTags, removeDuplicates, allowMentionsOfSelf, selfHandle]);

  const stats = useMemo(() => {
    const total = parsedComments.length;
    const eligible = filteredPool.length;

    // quick distribution of tag counts (0..5+)
    const buckets = { "0": 0, "1": 0, "2": 0, "3": 0, "4": 0, "5+": 0 } as Record<string, number>;
    for (const c of parsedComments) {
      const n = countUniqueTags(c);
      if (n >= 5) buckets["5+"] += 1;
      else buckets[String(n)] += 1;
    }

    return { total, eligible, buckets };
  }, [parsedComments, filteredPool]);

  function loadComments() {
    setError("");
    setWinners([]);
    const stamp = new Date().toISOString();
    setSeedStamp(stamp);
    setLoaded(true);
    if (parsedComments.length === 0) {
      setError("Paste comments first (one comment per line).");
      setLoaded(false);
    }
  }

  function pickWinners() {
    setError("");
    setWinners([]);

    if (!loaded) {
      setError("Click “Load & Filter” first.");
      return;
    }
    if (filteredPool.length === 0) {
      setError("No eligible comments after filters. Lower Min tags or check the rules.");
      return;
    }

    const qty = Math.max(1, Math.min(winnersToPick || 1, filteredPool.length));
    const poolCopy = [...filteredPool];
    const picked: Winner[] = [];

    for (let i = 0; i < qty; i++) {
      const idx = pickRandomIndex(poolCopy.length);
      const comment = poolCopy.splice(idx, 1)[0];
      const handle = extractHandles(comment)[0] ?? "(no @handle found)";
      picked.push({ handle, comment, pickedAt: new Date().toISOString() });
    }

    setWinners(picked);
  }

  function resetAll() {
    setError("");
    setLoaded(false);
    setSeedStamp("");
    setWinners([]);
  }

  function exportWinners() {
    const payload = {
      generatedAt: new Date().toISOString(),
      seedStamp,
      rules: {
        minTags,
        removeDuplicates,
        allowMentionsOfSelf,
        selfHandle,
        winnersToPick,
      },
      stats,
      winners,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `rafflebot_winners_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <header className="mb-8 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-2xl font-semibold tracking-tight">Rafflebot</h1>
            <div className="text-xs text-zinc-500">
              {loaded ? (
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-800">Loaded</span>
              ) : (
                <span className="rounded-full bg-zinc-200 px-3 py-1 text-zinc-700">Not loaded</span>
              )}
            </div>
          </div>
          <p className="max-w-3xl text-sm text-zinc-600">
            Paste comments (one per line), set filters, then pick winners. This is the “pro” version:
            duplicates control, tag thresholds, and exportable results.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left: input */}
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-zinc-900">1) Paste comments</h2>

            <textarea
              value={rawComments}
              onChange={(e) => setRawComments(e.target.value)}
              className="h-56 w-full resize-none rounded-xl border border-zinc-200 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
              placeholder={`Paste comments here (one per line)\n\nExample:\n@amy Loved this! @bob @carl\n@dave count me in @eve\nNo tags here`}
            />

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-600">Min unique @tags required</span>
                <input
                  type="number"
                  min={0}
                  value={minTags}
                  onChange={(e) => setMinTags(Number(e.target.value))}
                  className="rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-600">Winners to pick</span>
                <input
                  type="number"
                  min={1}
                  value={winnersToPick}
                  onChange={(e) => setWinnersToPick(Number(e.target.value))}
                  className="rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-col gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={removeDuplicates}
                  onChange={(e) => setRemoveDuplicates(e.target.checked)}
                  className="h-4 w-4"
                />
                Remove duplicates (by first @handle, else by comment text)
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={allowMentionsOfSelf}
                  onChange={(e) => setAllowMentionsOfSelf(e.target.checked)}
                  className="h-4 w-4"
                />
                Allow comments that tag “my” handle
              </label>

              {!allowMentionsOfSelf && (
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-zinc-600">Your handle (to exclude)</span>
                  <input
                    value={selfHandle}
                    onChange={(e) => setSelfHandle(e.target.value)}
                    className="rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
                    placeholder="@yourbrand"
                  />
                </label>
              )}
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                onClick={loadComments}
                className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Load &amp; Filter
              </button>

              <button
                onClick={pickWinners}
                className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50"
              >
                Pick Winner(s)
              </button>

              <button
                onClick={resetAll}
                className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50"
              >
                Reset
              </button>

              <button
                onClick={exportWinners}
                disabled={winners.length === 0}
                className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Export JSON
              </button>
            </div>

            {error && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}
          </section>

          {/* Right: stats + results */}
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-zinc-900">2) Pool + results</h2>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-zinc-200 p-3">
                <div className="text-xs text-zinc-500">Total comments</div>
                <div className="text-xl font-semibold">{stats.total}</div>
              </div>
              <div className="rounded-xl border border-zinc-200 p-3">
                <div className="text-xs text-zinc-500">Eligible after filters</div>
                <div className="text-xl font-semibold">{stats.eligible}</div>
              </div>
              <div className="rounded-xl border border-zinc-200 p-3">
                <div className="text-xs text-zinc-500">Seed stamp</div>
                <div className="truncate text-sm font-medium">{seedStamp || "—"}</div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-zinc-200 p-3">
              <div className="mb-2 text-xs font-semibold text-zinc-700">Tag counts (all comments)</div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="flex items-center justify-between rounded-lg bg-zinc-50 px-2 py-1">
                  <span className="text-zinc-600">0</span>
                  <span className="font-medium">{stats.buckets["0"]}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-zinc-50 px-2 py-1">
                  <span className="text-zinc-600">1</span>
                  <span className="font-medium">{stats.buckets["1"]}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-zinc-50 px-2 py-1">
                  <span className="text-zinc-600">2</span>
                  <span className="font-medium">{stats.buckets["2"]}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-zinc-50 px-2 py-1">
                  <span className="text-zinc-600">3</span>
                  <span className="font-medium">{stats.buckets["3"]}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-zinc-50 px-2 py-1">
                  <span className="text-zinc-600">4</span>
                  <span className="font-medium">{stats.buckets["4"]}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-zinc-50 px-2 py-1">
                  <span className="text-zinc-600">5+</span>
                  <span className="font-medium">{stats.buckets["5+"]}</span>
                </div>
              </div>
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Winners</h3>
                <span className="text-xs text-zinc-500">{winners.length ? `${winners.length} picked` : "—"}</span>
              </div>

              {winners.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-500">
                  No winners yet. Click <span className="font-medium text-zinc-700">Load &amp; Filter</span>, then{" "}
                  <span className="font-medium text-zinc-700">Pick Winner(s)</span>.
                </div>
              ) : (
                <div className="space-y-3">
                  {winners.map((w, i) => (
                    <div key={i} className="rounded-xl border border-zinc-200 p-3">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold">{w.handle}</div>
                        <div className="text-xs text-zinc-500">{new Date(w.pickedAt).toLocaleString()}</div>
                      </div>
                      <div className="mt-2 rounded-lg bg-zinc-50 p-2 text-sm text-zinc-700">{w.comment}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6 border-t border-zinc-200 pt-4 text-xs text-zinc-500">
              Notes: This is a client-only MVP (paste comments manually). Next step is connecting Instagram ingestion + auth.
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

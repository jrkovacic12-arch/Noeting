import type { Entry, Snapshot } from "../data/repository";

/**
 * Deterministic, strictly scoped context selection for future user-invoked AI.
 * Pure and local: no networking, model call, storage, or mutations.
 *
 * The caller must explicitly supply allowed entry IDs; an empty scope returns
 * nothing rather than silently reading the entire personal library.
 */
export type AIContextSource = {
  entryId: string;
  kind: Entry["kind"];
  excerpt: string;
  start: number;
  end: number;
};

export type AIContextRequest = {
  query: string;
  allowedEntryIds: readonly string[];
  maxEntries?: number;
  maxTotalChars?: number;
  maxCharsPerEntry?: number;
};

function bounded(value: number | undefined, fallback: number, maximum: number) {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(maximum, Math.floor(value)));
}

/** Every excerpt is an exact substring of a currently active selected entry. */
export function selectAIContext(
  snapshot: Snapshot,
  request: AIContextRequest,
): AIContextSource[] {
  if (!request.allowedEntryIds.length) return [];
  const scope = new Set(request.allowedEntryIds);
  const phrase = request.query.trim().toLocaleLowerCase();
  const terms = [...new Set(phrase.match(/[\p{L}\p{N}]+/gu) ?? [])];
  const maxEntries = bounded(request.maxEntries, 8, 12);
  const maxTotalChars = bounded(request.maxTotalChars, 3000, 8000);
  const maxCharsPerEntry = bounded(request.maxCharsPerEntry, 600, 1500);

  const scored = snapshot.entries
    .filter((entry) => scope.has(entry.id) && !entry.removed)
    .map((entry) => {
      const lower = entry.text.toLocaleLowerCase();
      const first = terms.map((term) => lower.indexOf(term)).filter((index) => index >= 0);
      const whole = phrase && lower.includes(phrase);
      const score = Number(Boolean(whole)) * 10 + first.length * 2;
      return { entry, score, firstIndex: whole ? lower.indexOf(phrase) : first[0] ?? 0 };
    })
    .filter(({ score }) => !terms.length || score > 0)
    .sort((a, b) =>
      b.score - a.score ||
      b.entry.createdAt.localeCompare(a.entry.createdAt) ||
      a.entry.id.localeCompare(b.entry.id),
    );

  const sources: AIContextSource[] = [];
  let remaining = maxTotalChars;
  for (const { entry, firstIndex } of scored) {
    if (sources.length >= maxEntries || remaining === 0) break;
    // Include surrounding words when a query hit occurs deep in a long Note.
    const start = terms.length ? Math.max(0, firstIndex - 72) : 0;
    const end = Math.min(entry.text.length, start + maxCharsPerEntry, start + remaining);
    if (end <= start) continue;
    sources.push({
      entryId: entry.id,
      kind: entry.kind,
      excerpt: entry.text.slice(start, end),
      start,
      end,
    });
    remaining -= end - start;
  }
  return sources;
}

/** Reject invented/unselected citations returned by a model. */
export function hasOnlyAllowedCitations(
  returnedEntryIds: readonly string[],
  selectedSources: readonly AIContextSource[],
): boolean {
  const allowed = new Set(selectedSources.map((source) => source.entryId));
  return returnedEntryIds.every((entryId) => allowed.has(entryId));
}

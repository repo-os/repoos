/**
 * Lexical file relevance scoring for the task context pack (#0650).
 *
 * This is a self-contained, dependency-free TF-IDF scorer. It ranks source
 * files by how well their text matches the task title + body, using:
 *
 *   - inverse document frequency over the repo `src/` corpus, so a rare term
 *     ("renderpack") outweighs a common one ("server");
 *   - `(1 + log tf) * idf` over a file's content;
 *   - a path-match bonus and an exported-name bonus so a term that names the
 *     file or one of its public exports outranks the same term buried in a
 *     comment or string literal.
 *
 * It deliberately does NOT import `src/ui-app/src/search.ts`: that search is
 * the same TF-IDF family but is tuned for short human queries over
 * tasks/docs/settings and uses edit distance for typo tolerance, which is
 * wrong for identifiers. We borrow the idea (IDF + field weighting), not the
 * code. No embeddings, no runtime dependency.
 */

/** Per-file lexical index persisted in the repo map, keyed by HEAD. */
export interface FileLexicalIndex {
  /** Repo-relative path. */
  path: string;
  /** Token -> occurrence count over the file's content. */
  terms: Record<string, number>;
  /** Tokens contributed by exported names (`export function fooBar`). */
  exports: string[];
}

/** Field weights for the scorer. Higher = a hit there dominates a body hit. */
export interface KeywordWeights {
  /** Weight for a term hit in the file path. */
  path: number;
  /** Weight for a term hit in an exported name. */
  export: number;
  /** Weight applied to the TF-IDF content score. */
  body: number;
}

/**
 * Default weights. A path hit is worth several body hits and an exported-name
 * hit a little less, so naming the file or its public API beats a passing
 * mention in a comment. Verified with `scripts/context-pack-eval.ts`; scaling
 * all three together 1x/3x/6x moved full-corpus mean recall by under a point,
 * so the field ratios (path > export > body), not the absolute magnitude,
 * carry the ranking.
 */
export const DEFAULT_KEYWORD_WEIGHTS: KeywordWeights = { path: 6, export: 4, body: 1 };

/**
 * How much a body term is worth relative to the same term in the task title.
 *
 * Task bodies lead with the specific problem but then carry generic process
 * boilerplate (acceptance checklists, "Notes for AI", workflow prose) that
 * matches files across the whole repo, so scoring the body at the title's
 * weight *lowers* recall. Measured over the full 427-task corpus with
 * `scripts/context-pack-eval.ts`, combined with the other signals:
 *
 *   bodyWeight 1.0 -> 47.6% mean recall, 9.4% zero-hit
 *   bodyWeight 0.5 -> 59.0% (250-task sample)
 *   bodyWeight 0.2 -> 63.9% (250-task sample)
 *   bodyWeight 0.05 -> 73.6% full corpus, 1.9% zero-hit
 *   bodyWeight 0.0 -> 78.7% (250-task sample)
 *
 * 0.05 keeps the body as a real (if secondary) field — for a vaguely-titled
 * task the problem paragraph still carries the only useful terms — without
 * letting boilerplate dominate.
 */
export const DEFAULT_BODY_WEIGHT = 0.05;

/** Tokens shorter than this are too noisy to be a useful signal. */
const MIN_TOKEN_LENGTH = 2;

/** Tokens longer than this are almost certainly a mistake or a hash. */
const MAX_TOKEN_LENGTH = 64;

/** A scored file: the relevance contribution and which task terms matched. */
export interface KeywordScore {
  path: string;
  /** Sum of the term contributions. */
  score: number;
  /** Task terms that matched the file, in task order. */
  matchedTerms: string[];
}

/**
 * Split text into lowercase search tokens. Identifiers are kept whole AND
 * split on camelCase / snake_case / `$` boundaries, so a task that says
 * "render pack" can match an identifier `renderPack`, and vice versa.
 */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  const re = /[A-Za-z_$][A-Za-z0-9_$]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[0];
    const lower = raw.toLowerCase();
    if (isUsefulToken(lower)) out.push(lower);
    // camelCase boundaries: "renderPack" -> ["render", "Pack"].
    const parts = raw.split(/(?=[A-Z])|[_$]/g);
    if (parts.length > 1) {
      for (const p of parts) {
        const lp = p.toLowerCase();
        if (lp !== lower && isUsefulToken(lp)) out.push(lp);
      }
    }
  }
  return out;
}

function isUsefulToken(token: string): boolean {
  if (token.length < MIN_TOKEN_LENGTH || token.length > MAX_TOKEN_LENGTH) return false;
  // Drop pure numbers — they carry little semantic signal for a source file.
  return !/^[0-9]+$/.test(token);
}

/** Tokenize a repo-relative path (directories + basename, extension included). */
export function tokenizePath(path: string): string[] {
  const spaced = path.replace(/[/\\.]/g, " ");
  return tokenize(spaced);
}

/**
 * Extract the tokens of a file's exported names. Best-effort regex pass:
 * covers `export function/const/class/interface/type/enum/let/var NAME`,
 * `export default function NAME`, and `export { a, b as c }`.
 */
export function extractExportTokens(content: string): string[] {
  const tokens = new Set<string>();
  const declarations =
    /export\s+(?:default\s+)?(?:async\s+)?(?:function\*?\s+|const\s+|let\s+|var\s+|class\s+|interface\s+|type\s+|enum\s+)([A-Za-z_$][A-Za-z0-9_$]*)/g;
  let m: RegExpExecArray | null;
  while ((m = declarations.exec(content)) !== null) {
    for (const t of tokenize(m[1])) tokens.add(t);
  }
  const lists = /export\s*\{([^}]*)\}/g;
  while ((m = lists.exec(content)) !== null) {
    for (const part of m[1].split(",")) {
      const name =
        part
          .trim()
          .split(/\s+as\s+/)
          .pop()
          ?.trim() ?? "";
      for (const t of tokenize(name)) tokens.add(t);
    }
  }
  return [...tokens];
}

/** Build the lexical index (term counts + export tokens) for one file. */
export function buildFileLexicalIndex(path: string, content: string): FileLexicalIndex {
  const terms: Record<string, number> = {};
  for (const token of tokenize(content)) {
    terms[token] = (terms[token] ?? 0) + 1;
  }
  return { path, terms, exports: extractExportTokens(content) };
}

/** Own-property term count — safe against inherited keys like "constructor". */
function termCount(terms: Record<string, number>, term: string): number {
  return Object.prototype.hasOwnProperty.call(terms, term) ? terms[term] : 0;
}

interface PreparedFile {
  file: FileLexicalIndex;
  pathTokens: Set<string>;
  exportTokens: Set<string>;
}

function prepare(files: FileLexicalIndex[]): PreparedFile[] {
  return files.map((file) => ({
    file,
    pathTokens: new Set(tokenizePath(file.path)),
    exportTokens: new Set(file.exports),
  }));
}

/** Whether a term appears anywhere in a file (content, path or exports). */
function fileHasTerm(p: PreparedFile, term: string): boolean {
  return termCount(p.file.terms, term) > 0 || p.pathTokens.has(term) || p.exportTokens.has(term);
}

/**
 * IDF per task term over the file corpus. Smoothed (`ln((n+1)/(df+1)) + 1`)
 * so a term in every file still contributes a little, and an unseen term
 * (df=0) scores highest — though it contributes nothing, since no file
 * matches it.
 */
export function buildTermIdf(terms: string[], files: PreparedFile[]): Map<string, number> {
  const n = files.length || 1;
  const idf = new Map<string, number>();
  for (const term of terms) {
    let df = 0;
    for (const f of files) if (fileHasTerm(f, term)) df++;
    idf.set(term, Math.log((n + 1) / (df + 1)) + 1);
  }
  return idf;
}

/**
 * Score every file against the task text. Returns a map keyed by path for
 * files with a nonzero score. Ties are not resolved here — callers sort and
 * apply a deterministic path tie-break.
 */
export function scoreKeywordRelevance(
  files: FileLexicalIndex[],
  taskText: string,
  weights: KeywordWeights = DEFAULT_KEYWORD_WEIGHTS,
): Map<string, KeywordScore> {
  const taskTokens = tokenize(taskText);
  // Deduplicate while preserving order, so `matchedTerms` reads naturally.
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const t of taskTokens) {
    if (!seen.has(t)) {
      seen.add(t);
      unique.push(t);
    }
  }
  const prepared = prepare(files);
  const out = new Map<string, KeywordScore>();
  if (unique.length === 0 || prepared.length === 0) return out;
  const idf = buildTermIdf(unique, prepared);

  for (const p of prepared) {
    let score = 0;
    const matched: string[] = [];
    for (const term of unique) {
      const idfValue = idf.get(term) ?? 1;
      let termScore = 0;
      const tf = termCount(p.file.terms, term);
      if (tf > 0) termScore += weights.body * (1 + Math.log(tf)) * idfValue;
      if (p.pathTokens.has(term)) termScore += weights.path * idfValue;
      if (p.exportTokens.has(term)) termScore += weights.export * idfValue;
      if (termScore > 0) {
        score += termScore;
        matched.push(term);
      }
    }
    if (score > 0) out.set(p.file.path, { path: p.file.path, score, matchedTerms: matched });
  }
  return out;
}

/**
 * Score a task by combining its title (full weight) and its body (scaled by
 * `bodyWeight`). The two texts are scored independently — each gets its own
 * IDF — and merged additively, so a term in a generic body sentence cannot
 * outweigh the same term in the title.
 */
export function scoreTaskKeywordRelevance(
  files: FileLexicalIndex[],
  title: string,
  body: string,
  weights: KeywordWeights = DEFAULT_KEYWORD_WEIGHTS,
  bodyWeight: number = DEFAULT_BODY_WEIGHT,
): Map<string, KeywordScore> {
  const titleScores = scoreKeywordRelevance(files, title, weights);
  if (bodyWeight <= 0 || !body.trim()) return titleScores;
  return mergeKeywordScores(titleScores, scoreKeywordRelevance(files, body, weights), bodyWeight);
}

/** Add `secondary`'s scores onto `primary`, scaling the secondary by `weight`. */
export function mergeKeywordScores(
  primary: Map<string, KeywordScore>,
  secondary: Map<string, KeywordScore>,
  weight: number,
): Map<string, KeywordScore> {
  for (const [path, s] of secondary) {
    const existing = primary.get(path);
    if (existing) {
      existing.score += weight * s.score;
      for (const term of s.matchedTerms) {
        if (!existing.matchedTerms.includes(term) && existing.matchedTerms.length < 8) {
          existing.matchedTerms.push(term);
        }
      }
    } else {
      primary.set(path, { path, score: weight * s.score, matchedTerms: [...s.matchedTerms] });
    }
  }
  return primary;
}

/**
 * Mermaid identifier + label sanitization. Arbitrary user text — entity names,
 * actor names, stack choices — flows into diagrams, and unsanitized text is a
 * classic silent breaker: spaces, punctuation, unicode, leading digits and a few
 * reserved words all produce Mermaid that fails to parse and renders as an error
 * block on GitHub. This module is the single chokepoint (technical-plan M7 risk).
 *
 * Two distinct problems, two functions:
 *  - `mermaidId`  → a safe *node identifier* matching `[A-Za-z_][A-Za-z0-9_]*`.
 *  - `mermaidLabel` → the human-readable text shown in a `["..."]` / `: ...` slot,
 *    preserved for display but escaped so it can't break the diagram.
 *
 * Because `mermaidId` is lossy ("My App!" and "My App?" both collapse to
 * "My_App"), callers that emit multiple nodes must de-dupe with `IdAllocator` so
 * two distinct names never share an id and every reference resolves.
 */

/**
 * Mermaid keywords that break when used as a bare node id. `end` is the notorious
 * one (flowchart/sequence); the rest are reserved diagram/statement keywords.
 */
const RESERVED = new Set([
  'end',
  'graph',
  'subgraph',
  'class',
  'click',
  'style',
  'state',
  'note',
  'alt',
  'loop',
  'opt',
  'par',
  'and',
  'rect',
]);

/** Turn arbitrary text into a safe Mermaid node identifier. */
export function mermaidId(raw: string): string {
  // 1. NFKD-normalize and strip combining marks (U+0300–U+036F) so "café" →
  //    "cafe" (stable ASCII).
  const ascii = raw.normalize('NFKD').replace(/\p{Mn}/gu, '');
  // 2. Non-alphanumeric runs → underscore; 3. collapse and trim underscores.
  let id = ascii
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  // 4. Leading-digit / empty guard — Mermaid ids may not start with a digit.
  if (id === '' || /^[0-9]/.test(id)) {
    id = `n_${id}`.replace(/_+$/, '');
  }
  // 5. Reserved-word guard.
  if (RESERVED.has(id.toLowerCase())) {
    id = `${id}_`;
  }
  return id;
}

/** Escape human text for a Mermaid label slot, preserving unicode and spaces. */
export function mermaidLabel(raw: string): string {
  return raw
    .replace(/"/g, '#quot;')
    .replace(/[[\]{}()]/g, (ch) => LABEL_ENTITIES[ch] ?? ch)
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

const LABEL_ENTITIES: Record<string, string> = {
  '[': '#91;',
  ']': '#93;',
  '{': '#123;',
  '}': '#125;',
  '(': '#40;',
  ')': '#41;',
};

/**
 * Allocates collision-free ids within a single diagram, appending `_2`, `_3`…
 * when distinct inputs sanitize to the same base. Look up the same key twice and
 * you get the same id back — so a node declaration and every edge/relationship
 * reference to it always agree.
 *
 * `id(name)` keys on the display name (right when refs are by name, e.g. the
 * component graph). `idFor(key, base)` separates identity from display: entities
 * referenced by a distinct id but shown by name get a unique node even when two
 * entities share a name.
 */
export class IdAllocator {
  private readonly byKey = new Map<string, string>();
  private readonly used = new Set<string>();

  /** Allocate an id from `base`, cached under `key`. */
  idFor(key: string, base: string): string {
    const existing = this.byKey.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const root = mermaidId(base);
    let candidate = root;
    let n = 2;
    while (this.used.has(candidate)) {
      candidate = `${root}_${n}`;
      n += 1;
    }
    this.used.add(candidate);
    this.byKey.set(key, candidate);
    return candidate;
  }

  /** Allocate an id from a display name, cached under that same name. */
  id(name: string): string {
    return this.idFor(name, name);
  }
}

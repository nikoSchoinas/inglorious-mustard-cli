import mermaid from 'mermaid';

/**
 * Validate emitted Mermaid with the real parser (M7 acceptance: "invalid Mermaid
 * renders as an error block on GitHub and would embarrass the product").
 *
 * Renderers emit a ```mermaid fenced block (§9.7); this strips the fence and hands
 * the inner diagram text to the parser, which throws on invalid syntax. Mermaid's
 * text sanitization (DOMPurify) needs a DOM, so the tests that call this run under
 * jsdom via a `// @vitest-environment jsdom` directive; the rest stay on node.
 */

let initialised = false;

function stripFence(fenced: string): string {
  const match = fenced.match(/```mermaid\n([\s\S]*?)\n```/);
  if (match === null) {
    throw new Error(`Expected a \`\`\`mermaid fenced block, got:\n${fenced}`);
  }
  return match[1];
}

/** Assert the fenced Mermaid block parses; rejects (throws) on invalid syntax. */
export async function assertValidMermaid(fenced: string): Promise<void> {
  if (!initialised) {
    mermaid.initialize({ startOnLoad: false });
    initialised = true;
  }
  // Throws a parse error the caller surfaces; resolves truthy on success.
  await mermaid.parse(stripFence(fenced));
}

import type { UseCase } from '../../schemas/use-case.js';

/**
 * Render a `UseCase` as a Mermaid `sequenceDiagram` (spec §8.8, §9.7). Participants
 * come from the happy-path `actor` enum; each step is a message to whoever acts
 * next; failure paths render as `Note over` annotations so the reader sees what
 * goes wrong and what the user sees. Emitted as a ```mermaid fenced block.
 *
 * M12 selects the 2–3 riskiest use cases and renders each; `renderSequenceDiagrams`
 * joins several for a single artifact.
 */

const ACTOR_LABEL: Record<UseCase['happyPath'][number]['actor'], string> = {
  user: 'User',
  system: 'System',
  database: 'Database',
  external: 'External',
};

/** Sequence message/note text can't contain newlines; collapse and trim. */
function line(text: string): string {
  return text.replace(/[\r\n]+/g, ' ').trim();
}

export function renderSequenceDiagram(useCase: UseCase): string {
  const lines: string[] = ['sequenceDiagram'];

  // Participants in first-seen order; always at least one so the diagram is valid.
  const seen: string[] = [];
  for (const step of useCase.happyPath) {
    const label = ACTOR_LABEL[step.actor];
    if (!seen.includes(label)) {
      seen.push(label);
    }
  }
  if (seen.length === 0) {
    seen.push('System');
  }
  for (const p of seen) {
    lines.push(`  participant ${p}`);
  }

  // Each step is a message to the actor of the next step (self-message when last).
  const steps = useCase.happyPath;
  steps.forEach((step, i) => {
    const from = ACTOR_LABEL[step.actor];
    const next = steps[i + 1];
    const to = next === undefined ? from : ACTOR_LABEL[next.actor];
    lines.push(`  ${from}->>${to}: ${line(step.action)}`);
  });

  const anchor = seen[0];
  for (const fp of useCase.failurePaths) {
    lines.push(`  Note over ${anchor}: Failure — ${line(fp.trigger)} → ${line(fp.userVisible)}`);
  }

  return fence(lines);
}

/** Render several use cases as separate sequence diagrams, joined by blank lines. */
export function renderSequenceDiagrams(useCases: readonly UseCase[]): string {
  return useCases.map(renderSequenceDiagram).join('\n\n');
}

function fence(lines: readonly string[]): string {
  return `\`\`\`mermaid\n${lines.join('\n')}\n\`\`\``;
}

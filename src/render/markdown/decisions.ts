import type {
  AdrEntry,
  IrreversibleConfirmation,
  IrreversibleDecision,
  Phase5Output,
} from '../../schemas/architecture.js';
import { type FrontmatterMeta, withFrontmatter } from './frontmatter.js';

/**
 * Render `05-DECISIONS.md` (spec §3.2, §8.8): the ADR log, and the three
 * decisions most expensive to reverse — each shown with the outcome of its
 * individual confirm at the irreversibility gate. A declined (or unrecorded)
 * decision renders under a visible "Not confirmed" heading rather than being
 * silently dropped: the gate never traps the user, so the artifact tells the
 * truth and the agent sees the open risk (technical-plan §M12).
 *
 * Deterministic — reads the shared `Phase5Output`; the same object drives
 * `05-ARCHITECTURE.md`.
 */
export function renderDecisions(obj: Phase5Output, meta: FrontmatterMeta): string {
  const sections: string[] = ['# Decisions', ''];

  sections.push('## Architecture decision records', '');
  if (obj.adrs.length === 0) {
    sections.push('_No architecture decision records were produced._', '');
  } else {
    for (const adr of obj.adrs) {
      sections.push(renderAdr(adr), '');
    }
  }

  sections.push('## Irreversible decisions — confirm before you build', '');
  if (obj.irreversibleDecisions.length === 0) {
    sections.push('_No irreversible decisions were flagged._');
    return withFrontmatter({ ...meta, phase: 5 }, `${sections.join('\n').trimEnd()}\n`);
  }

  const confirmationById = new Map(obj.confirmations.map((c) => [c.decisionId, c]));
  for (const decision of obj.irreversibleDecisions) {
    sections.push(renderIrreversible(decision, confirmationById.get(decision.id)), '');
  }

  return withFrontmatter({ ...meta, phase: 5 }, `${sections.join('\n').trimEnd()}\n`);
}

function renderAdr(adr: AdrEntry): string {
  return [
    `### ${adr.id} — ${adr.title}`,
    '',
    `**Status:** ${adr.status}`,
    '',
    `**Context.** ${adr.context}`,
    '',
    `**Decision.** ${adr.decision}`,
    '',
    `**Consequences.** ${adr.consequences}`,
  ].join('\n');
}

function renderIrreversible(
  decision: IrreversibleDecision,
  confirmation: IrreversibleConfirmation | undefined,
): string {
  const lines = [`### ${decision.id} — ${decision.title}`, '', decision.plainLanguage, ''];
  lines.push(`**If you change this later:** ${decision.consequence}`, '');
  if (confirmation?.confirmed === true) {
    lines.push(`**Your call:** Confirmed ✓ on ${confirmation.confirmedAt}`);
  } else {
    lines.push('**Not confirmed — revisit before building.**');
  }
  return lines.join('\n');
}

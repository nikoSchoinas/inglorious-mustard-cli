import type { Phase2Output } from '../../schemas/phase2-output.js';
import type { UseCase } from '../../schemas/use-case.js';
import { type FrontmatterMeta, withFrontmatter } from './frontmatter.js';
import { renderTable } from './table.js';

/**
 * Render `02-USE-CASES.md` (spec §8.5 synthesis) from the confirmed `Phase2Output`.
 * Everything here is user-confirmed by the time it renders — happy paths accepted or
 * edited, failure answers given, build order confirmed, screens chosen — so this is a
 * deterministic render, not an LLM synthesis (§7.3.4). Use cases are laid out in the
 * confirmed build order; each shows its happy path and, always, its failure paths.
 *
 * Guard: every use case must carry at least one failure path (technical-plan §5, M9
 * acceptance). A use case with none is a flow bug, so we throw rather than silently
 * emit a use case that skipped the signature interrogation.
 */
export function renderUseCases(obj: Phase2Output, meta: FrontmatterMeta): string {
  const ordered = orderUseCases(obj);

  for (const uc of ordered) {
    if (uc.failurePaths.length === 0) {
      throw new Error(
        `Use case "${uc.id}" (${uc.title}) has no failure paths — every use case must be interrogated for failure (§8.5 step 6).`,
      );
    }
  }

  const actorName = actorNamer(obj);

  const sections: string[] = [
    '# Use Cases & UI',
    '',
    renderScreens(obj),
    '',
    renderBuildOrder(ordered),
    '',
    '## Use cases',
  ];

  for (const uc of ordered) {
    sections.push('', renderUseCase(uc, actorName(uc.actorId)));
  }

  return withFrontmatter({ ...meta, phase: 2 }, `${sections.join('\n')}\n`);
}

/** Order use cases by the confirmed build order; append any not listed, in place. */
function orderUseCases(obj: Phase2Output): UseCase[] {
  if (obj.dependencyOrder.length === 0) {
    return [...obj.useCases];
  }
  const byId = new Map(obj.useCases.map((uc) => [uc.id, uc]));
  const ordered: UseCase[] = [];
  for (const id of obj.dependencyOrder) {
    const uc = byId.get(id);
    if (uc) {
      ordered.push(uc);
      byId.delete(id);
    }
  }
  for (const uc of obj.useCases) {
    if (byId.has(uc.id)) {
      ordered.push(uc);
    }
  }
  return ordered;
}

function renderScreens(obj: Phase2Output): string {
  const approach = obj.screens.approach.trim() || 'not decided yet';
  const lines = ['## Screens', '', `**Design approach:** ${approach}`, ''];
  if (obj.screens.screens.length === 0) {
    lines.push('_No screens listed yet._');
  } else {
    for (const screen of obj.screens.screens) {
      lines.push(`- ${screen}`);
    }
  }
  return lines.join('\n');
}

function renderBuildOrder(ordered: readonly UseCase[]): string {
  const lines = ['## Build order', ''];
  if (ordered.length === 0) {
    lines.push('_No use cases yet._');
    return lines.join('\n');
  }
  ordered.forEach((uc, i) => {
    lines.push(`${i + 1}. ${uc.title} (${uc.id})`);
  });
  return lines.join('\n');
}

function renderUseCase(uc: UseCase, actor: string): string {
  const lines = [`### ${uc.id} — ${uc.title}`, '', `**Actor:** ${actor}`, ''];

  if (uc.preconditions.length > 0) {
    lines.push('**Preconditions:**', '');
    for (const pre of uc.preconditions) {
      lines.push(`- ${pre}`);
    }
    lines.push('');
  }

  lines.push('**Happy path**', '');
  if (uc.happyPath.length === 0) {
    lines.push('_No happy path recorded._');
  } else {
    lines.push(
      renderTable(
        [{ header: 'Step' }, { header: 'Actor' }, { header: 'Action' }],
        uc.happyPath.map((step, i) => [String(i + 1), step.actor, step.action]),
      ),
    );
  }

  lines.push('', '**Failure paths**', '');
  lines.push(
    renderTable(
      [{ header: 'Trigger' }, { header: 'System response' }, { header: 'What the user sees' }],
      uc.failurePaths.map((f) => [f.trigger, f.systemResponse, f.userVisible]),
    ),
  );

  return lines.join('\n');
}

/** Resolve an actor id to its name via the extraction; fall back to the id. */
function actorNamer(obj: Phase2Output): (actorId: string) => string {
  const byId = new Map(obj.extraction.actors.map((a) => [a.id, a.name]));
  return (actorId) => byId.get(actorId) ?? actorId;
}

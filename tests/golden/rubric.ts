import { isValidOrder } from '../../src/engine/topo.js';
import { Phase2Output } from '../../src/schemas/phase2-output.js';
import { Phase6Output } from '../../src/schemas/roadmap.js';
import { Phase4Output } from '../../src/schemas/stack.js';
import { Task } from '../../src/schemas/task.js';
import type { GoldenBundle } from './bundle.js';
import { phaseObject } from './bundle.js';

/**
 * The DETERMINISTIC half of the §10 rubric (technical-plan §5, M15): "code assertions,
 * not judge opinion". Each mechanical property the golden bundle must satisfy is a pure
 * function over the bundle — no LLM, no tokens, runnable in ordinary `pnpm test`. These
 * are the regression tripwire: a change that drops a use case's failure path or breaks the
 * roadmap topology fails a line here, loudly and offline, before the judge is ever asked.
 *
 * The judge (`judge.ts`) is reserved for the SOFT lines — quality, contradictions, vague
 * rules — which no assertion can decide.
 */

/** The §9.7 AI-LAWS line cap, asserted on the rendered artifact as well as in the renderer. */
export const AI_LAWS_LINE_CAP = 200;

export interface RubricLine {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

/** `needs.*` fact → the stack `category` that must be present when the need is active. */
const NEED_TO_CATEGORY: Record<string, string> = {
  'needs.objectStorage': 'storage',
  'needs.payments': 'payments',
  'needs.email': 'email',
  'needs.background': 'queue',
  'needs.inference': 'inference',
  'needs.auth': 'auth',
};

/** A need is "active" when its fact is truthy and not an explicit opt-out (`false`/`none`). */
function needActive(value: unknown): boolean {
  if (value === undefined || value === false || value === 'none' || value === '') {
    return false;
  }
  return true;
}

/** Every actor in the domain extraction is referenced by at least one use case (§10). */
export function actorCoverage(bundle: GoldenBundle): RubricLine {
  const id = 'actor-coverage';
  const label = 'Every actor appears in a use case';
  const parsed = Phase2Output.safeParse(phaseObject(bundle.session, 2));
  if (!parsed.success) {
    return { id, label, passed: false, detail: 'No parseable Phase 2 output in session state.' };
  }
  const referenced = new Set(parsed.data.useCases.map((uc) => uc.actorId));
  const orphans = parsed.data.extraction.actors
    .filter((a) => !referenced.has(a.id))
    .map((a) => a.name);
  return orphans.length === 0
    ? {
        id,
        label,
        passed: true,
        detail: `All ${parsed.data.extraction.actors.length} actors covered.`,
      }
    : { id, label, passed: false, detail: `Actors with no use case: ${orphans.join(', ')}.` };
}

/** Every use case carries at least one failure path — the signature §6.4 guarantee. */
export function failurePathCoverage(bundle: GoldenBundle): RubricLine {
  const id = 'failure-path-coverage';
  const label = 'Every use case has ≥1 failure path';
  const parsed = Phase2Output.safeParse(phaseObject(bundle.session, 2));
  if (!parsed.success) {
    return { id, label, passed: false, detail: 'No parseable Phase 2 output in session state.' };
  }
  const bare = parsed.data.useCases
    .filter((uc) => uc.failurePaths.length === 0)
    .map((uc) => uc.title);
  return bare.length === 0
    ? {
        id,
        label,
        passed: true,
        detail: `All ${parsed.data.useCases.length} use cases have a failure path.`,
      }
    : { id, label, passed: false, detail: `Use cases with no failure path: ${bare.join(', ')}.` };
}

/** The roadmap is a valid topological ordering of the declared task dependencies (§10). */
export function roadmapTopology(bundle: GoldenBundle): RubricLine {
  const id = 'roadmap-topology';
  const label = 'Roadmap is a valid topological ordering';
  // Prefer the Phase 6 output; fall back to the mirrored `session.tasks`.
  const p6 = Phase6Output.safeParse(phaseObject(bundle.session, 6));
  const tasks = p6.success
    ? p6.data.orderedTasks
    : Task.array().safeParse(bundle.session.tasks).data;
  if (tasks === undefined || tasks.length === 0) {
    return { id, label, passed: false, detail: 'No roadmap tasks in session state.' };
  }
  const order = tasks.map((t) => t.id);
  return isValidOrder(order, tasks)
    ? { id, label, passed: true, detail: `${tasks.length} tasks in a dependency-respecting order.` }
    : { id, label, passed: false, detail: `Order violates a dependency: ${order.join(' → ')}.` };
}

/** Every active `needs.*` fact is satisfied by a matching stack category decision (§10). */
export function needsSatisfiedByStack(bundle: GoldenBundle): RubricLine {
  const id = 'needs-stack-satisfaction';
  const label = 'Stack satisfies every derived need';
  const parsed = Phase4Output.safeParse(phaseObject(bundle.session, 4));
  if (!parsed.success) {
    return { id, label, passed: false, detail: 'No parseable Phase 4 output in session state.' };
  }
  const categories = new Set(parsed.data.decisions.map((d) => d.category));
  const missing: string[] = [];
  for (const [need, category] of Object.entries(NEED_TO_CATEGORY)) {
    if (needActive(bundle.session.facts[need]) && !categories.has(category as never)) {
      missing.push(`${need} → ${category}`);
    }
  }
  return missing.length === 0
    ? { id, label, passed: true, detail: 'All active needs have a matching stack decision.' }
    : { id, label, passed: false, detail: `Unmet needs: ${missing.join(', ')}.` };
}

/** The rendered `01-AI-LAWS.md` is within the §9.7 line cap. */
export function aiLawsWithinCap(bundle: GoldenBundle): RubricLine {
  const id = 'ai-laws-line-cap';
  const label = `01-AI-LAWS.md within ${AI_LAWS_LINE_CAP} lines`;
  const body = bundle.artifacts['01-AI-LAWS.md'];
  if (body === undefined) {
    return { id, label, passed: false, detail: '01-AI-LAWS.md was not written.' };
  }
  // Trailing newline shouldn't count as an extra line.
  const lines = body.replace(/\n$/, '').split('\n').length;
  return lines <= AI_LAWS_LINE_CAP
    ? { id, label, passed: true, detail: `${lines} lines.` }
    : {
        id,
        label,
        passed: false,
        detail: `${lines} lines exceeds the ${AI_LAWS_LINE_CAP}-line cap.`,
      };
}

/** Run every deterministic rubric line over a bundle. */
export function runRubric(bundle: GoldenBundle): RubricLine[] {
  return [
    actorCoverage(bundle),
    failurePathCoverage(bundle),
    roadmapTopology(bundle),
    needsSatisfiedByStack(bundle),
    aiLawsWithinCap(bundle),
  ];
}

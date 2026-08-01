import type { ProposeEnumValuesFn } from '../llm/passes/propose-enum-values.js';
import { phase3 } from '../questions/bank/phase-3.js';
import { resolvePrompt } from '../questions/index.js';
import { deriveSessionId } from '../render/markdown/frontmatter.js';
import { createRendererRegistry } from '../render/register.js';
import type { RendererRegistry } from '../render/registry.js';
import type { DomainExtraction } from '../schemas/extraction.js';
import { Phase2Output } from '../schemas/phase2-output.js';
import { Phase3Output, type Retention } from '../schemas/schema-model.js';
import type { Answer, MustardSession, PhaseState } from '../schemas/session.js';
import { type EditorLauncher, defaultEditorLauncher } from '../ui/editor.js';
import type { Prompter } from '../ui/prompter.js';
import { readVersion } from '../version.js';
import { type IncomingFact, applyFacts } from './facts.js';
import {
  type RunnerIO,
  fileArtifactIO,
  isAnswered,
  makeAnswer,
  phaseStateOf,
  splitList,
  withPhase,
} from './orchestrator.js';
import {
  ambiguousRelationships,
  cardinalityQuestion,
  entityName,
  enumAttributes,
  reverseCardinalityQuestion,
  seedModel,
  setCardinality,
  setEnumValues,
  setRetention,
} from './phase-3-edit.js';
import { saveSession } from './session.js';

/**
 * Phase 3 — Structure & Schemas (spec §8.6, technical-plan §5, M10). "Translation mode":
 * the data model is mostly *derived* from the Phase 2 entities; Phase 3 asks only what
 * cannot be inferred — the cardinality of `ambiguous` relationships, the values of
 * `isEnum` attributes, and one global retention policy — then renders `03-SCHEMAS.md`.
 *
 * Like Phase 2 this is a BESPOKE orchestrator (§8.6 doesn't fit the generic `runPhase`
 * machine): its per-relationship and per-enum-attribute loops are dynamic in the shape
 * of the extraction, not a static seed set. Question STRINGS still come from the bank
 * (the retention select in `phase-3.ts`) or a pure template over entity names; only the
 * flow lives here (the M2 tripwire holds).
 *
 * Emits `03-SCHEMAS.md` ONLY. `03-STRUCTURE.md` keeps its Phase 3 number but is a Phase 4
 * output (§8.6/§8.7, pitfall §7.1) — the artifact set comes from `phase3.synthesis.artifacts`.
 *
 * Idempotent, answer-level resume (pitfall §7.5): position is re-derived from marker
 * answers, never an internal cursor:
 *   - `p3.seeded` absent          → derive the working `Phase3Output` from Phase 2
 *   - `p3.card.<eid>.<i>` per rel  → disambiguate one ambiguous relationship
 *   - `p3.enum.<eid>.<attr>` per   → propose + capture one enum's allowed values
 *   - `p3.retention`              → the single global retention select
 *   - `p3.write`                  → render, review, write `03-SCHEMAS.md`, accept
 * A Ctrl-C loses nothing and never re-runs a pass for an attribute already captured.
 */

export interface RunPhase3Deps {
  prompter: Prompter;
  /** Phase 3 per-enum-attribute value-proposal pass (fast). */
  proposeEnumValues: ProposeEnumValuesFn;
  /** Where `03-SCHEMAS.md` is written. Defaults to `mustard/` in the cwd. */
  io?: RunnerIO;
  /** Defaults to `$EDITOR` via `defaultEditorLauncher`. */
  editor?: EditorLauncher;
  /** Renderer registry. Defaults to the production registry. */
  registry?: RendererRegistry;
  /** Package version for artifact frontmatter. Defaults to the runtime version. */
  mustardVersion?: string;
  /** ISO clock for `askedAt`/`acceptedAt`/`generated_at`. Injectable for tests. */
  now?: () => string;
  /** Persist step. Defaults to `saveSession` (atomic write + `.bak`). */
  save?: (session: MustardSession) => MustardSession;
}

const PHASE = 3;
const SEEDED = 'p3.seeded';
const RETENTION_DONE = 'p3.retention';
const WRITE_DONE = 'p3.write';
const cardMarker = (fromEntityId: string, index: number): string =>
  `p3.card.${fromEntityId}.${index}`;
const enumMarker = (entityId: string, attrName: string): string =>
  `p3.enum.${entityId}.${attrName}`;

const REVIEW_CHOICES = [
  { value: 'accept', label: 'Accept — write it and move on' },
  { value: 'edit', label: 'Edit in $EDITOR' },
];

export async function runPhase3(
  session: MustardSession,
  deps: RunPhase3Deps,
): Promise<MustardSession> {
  const now = deps.now ?? (() => new Date().toISOString());
  const save = deps.save ?? ((s: MustardSession) => saveSession(s));
  const io = deps.io ?? fileArtifactIO();
  const editor = deps.editor ?? defaultEditorLauncher;
  const registry = deps.registry ?? createRendererRegistry();
  const mustardVersion = deps.mustardVersion ?? readVersion();
  const { prompter } = deps;

  let current = save(
    withPhase(session, PHASE, (_next, ps) => {
      if (ps.status === 'pending') {
        ps.status = 'in_progress';
      }
    }),
  );

  // 0. SEED — derive the working model from Phase 2's confirmed extraction (idempotent).
  if (!isAnswered(phaseState(current), SEEDED)) {
    const model = seedModel(readExtraction(current));
    current = save(
      withPhase(current, PHASE, (_next, ps) => {
        ps.synthesisedObject = model;
        ps.answers.push(makeAnswer(SEEDED, 'confirm', true, 'derived', now()));
      }),
    );
  }

  // 1. CARDINALITY — disambiguate each `ambiguous` relationship (§8.6). Deterministic
  // templated confirms — no LLM. Two directions resolve all three cardinalities:
  // forward `no` → one_to_one; forward `yes` + reverse `no` → one_to_many; both `yes`
  // → many_to_many. Indices are absolute within the entity's relationships and never
  // shift, so the per-relationship markers stay stable across resume.
  for (const ref of ambiguousRelationships(readOutput(phaseState(current)))) {
    const marker = cardMarker(ref.fromEntityId, ref.index);
    if (isAnswered(phaseState(current), marker)) {
      continue;
    }
    const output = readOutput(phaseState(current));
    const fromName = entityName(output, ref.fromEntityId);
    const toName = entityName(output, ref.toEntityId);
    const many = await prompter.confirm({
      message: cardinalityQuestion(fromName, toName),
    });
    let cardinality: 'one_to_one' | 'one_to_many' | 'many_to_many' = 'one_to_one';
    if (many) {
      const reverse = await prompter.confirm({
        message: reverseCardinalityQuestion(fromName, toName),
      });
      cardinality = reverse ? 'many_to_many' : 'one_to_many';
    }
    current = save(
      withPhase(current, PHASE, (_next, ps) => {
        ps.synthesisedObject = setCardinality(
          readOutput(ps),
          ref.fromEntityId,
          ref.index,
          cardinality,
        );
        ps.answers.push(makeAnswer(marker, 'select', cardinality, 'seed', now()));
      }),
    );
  }

  // 2. ENUM DISCOVERY — for each `isEnum` attribute, propose values (LLM), then let the
  // user confirm/extend them (§8.6). Persisted per attribute.
  for (const ref of enumAttributes(readOutput(phaseState(current)))) {
    const marker = enumMarker(ref.entityId, ref.attrName);
    if (isAnswered(phaseState(current), marker)) {
      continue;
    }
    const output = readOutput(phaseState(current));
    const model = output.models.find((m) => m.entityId === ref.entityId);
    const attr = model?.attributes.find((a) => a.name === ref.attrName);
    const outcome = await deps.proposeEnumValues(current, {
      entityName: model?.name ?? ref.entityId,
      entityDescription: model?.description ?? '',
      attributeName: ref.attrName,
      attributeType: attr?.type ?? 'string',
    });
    const suggestions = outcome.status === 'ok' ? outcome.value : [];

    let picked: string[] = [];
    if (suggestions.length > 0) {
      picked = await prompter.multiselect({
        message: `Which values can a ${model?.name ?? ref.entityId}'s "${ref.attrName}" be? Select all that apply.`,
        options: suggestions.map((s) => ({ value: s, label: s })),
      });
    }
    const custom = splitList(
      await prompter.text({
        message: `Any other values for "${ref.attrName}"? Separate with commas, or leave blank.`,
      }),
    );
    const values = [...picked, ...custom];

    current = save(
      withPhase(current, PHASE, (_next, ps) => {
        ps.synthesisedObject = setEnumValues(readOutput(ps), ref.entityId, ref.attrName, values);
        ps.answers.push(makeAnswer(marker, 'multiselect', values, 'seed', now()));
      }),
    );
  }

  // 3. RETENTION — the single global soft-delete/retention select (bank question).
  if (!isAnswered(phaseState(current), RETENTION_DONE)) {
    const q = phase3.seed.find((s) => s.id === RETENTION_DONE);
    if (q === undefined) {
      throw new Error('phase-3 bank is missing the retention question.');
    }
    const value = await prompter.select({
      message: resolvePrompt(q, current.literacy),
      ...(q.help !== undefined ? { help: q.help } : {}),
      options: q.options ?? [],
    });
    current = save(
      withPhase(current, PHASE, (next, ps) => {
        ps.synthesisedObject = setRetention(readOutput(ps), value as Retention);
        ps.answers.push(makeAnswer(RETENTION_DONE, 'select', value, 'seed', now()));
        if (q.mapsTo !== undefined) {
          const incoming: IncomingFact[] = [{ key: q.mapsTo, value, source: 'answer' }];
          applyFacts(next, incoming);
        }
      }),
    );
  }

  // 4. WRITE — render `03-SCHEMAS.md` (and only that), review, write, accept the phase.
  if (!isAnswered(phaseState(current), WRITE_DONE)) {
    const artifacts = phase3.synthesis?.artifacts ?? [];
    const artifactName = artifacts[0];
    if (artifactName === undefined) {
      throw new Error('phase-3 bank declares no synthesis artifacts.');
    }
    const output = readOutput(phaseState(current));
    const rendered = registry.render(artifactName, output, {
      phase: PHASE,
      sessionId: deriveSessionId(current),
      generatedAt: now(),
      mustardVersion,
    });

    prompter.note(rendered.body, rendered.name);
    const choice = await prompter.select({
      message: 'How does this look?',
      options: REVIEW_CHOICES,
    });

    let body = rendered.body;
    let edited = false;
    if (choice === 'edit') {
      body = await editor.launch(rendered.body);
      edited = true;
    }
    io.writeArtifact(rendered.name, body);

    current = save(
      withPhase(current, PHASE, (next, ps) => {
        ps.status = 'accepted';
        ps.acceptedAt = now();
        ps.artifactPaths = [...artifacts];
        ps.edited = edited;
        ps.answers.push(makeAnswer(WRITE_DONE, 'confirm', true, 'derived', now()));
        next.currentPhase = Math.max(next.currentPhase, PHASE + 1);
      }),
    );
  }

  return current;
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

/** Phase 3's state (throwing getter), phase-bound for the many call sites. */
function phaseState(session: MustardSession): PhaseState {
  return phaseStateOf(session, PHASE);
}

/** Read the confirmed Phase 2 extraction that Phase 3 derives its model from. */
function readExtraction(session: MustardSession): DomainExtraction {
  const ps2 = session.phases.find((p) => p.id === 2);
  if (ps2?.synthesisedObject === undefined) {
    throw new Error('Phase 2 output missing — Phase 3 needs a confirmed Phase 2.');
  }
  return Phase2Output.parse(ps2.synthesisedObject).extraction;
}

/** Read and validate the working Phase3Output. Only valid after the SEED step. */
function readOutput(ps: PhaseState): Phase3Output {
  if (ps.synthesisedObject === undefined) {
    throw new Error('Phase 3 model missing — the SEED step must run first.');
  }
  return Phase3Output.parse(ps.synthesisedObject);
}

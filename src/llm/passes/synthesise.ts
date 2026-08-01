import type { LanguageModel } from 'ai';
import type { SynthesisOutput, SynthesiseFn } from '../../engine/runner.js';
import { CapExceededError } from '../../render/markdown/caps.js';
import { type FrontmatterMeta, deriveSessionId } from '../../render/markdown/frontmatter.js';
import type { RendererRegistry } from '../../render/registry.js';
import { ManifestoArtifact } from '../../schemas/manifesto.js';
import type { MustardSession } from '../../schemas/session.js';
import type { LlmOutcome } from '../client.js';
import type { LLMClient } from '../client.js';
import { synthesiseManifestoPrompt } from '../prompts/synthesise-manifesto.js';
import { phaseStateOf, projectAnswers } from './input.js';

/**
 * The real SYNTHESISE pass (spec §8.2 step 4), a small dispatcher keyed on
 * `phase.synthesis.pass`. In M6 the only registered pass is `synthesise-manifesto`;
 * later phases add their own branches here.
 *
 * The renderers enforce the output caps and throw `CapExceededError` on breach; the
 * pass converts that into ONE corrective re-synthesis, then falls back to a degraded
 * outcome — the runner renders the raw answers under the artifact headings (§9.8).
 */
export interface SynthesiseDeps {
  client: LLMClient;
  /** The deep-tier model handle. */
  model: LanguageModel;
  mustardVersion: string;
  /** ISO clock for the `generated_at` frontmatter. Injectable for deterministic tests. */
  now: () => string;
  /** Artifact-name → renderer registry (§9.4); drives which files a phase emits. */
  registry: RendererRegistry;
}

export function createSynthesise(deps: SynthesiseDeps): SynthesiseFn {
  return async (phase, session, steering) => {
    const passName = phase.synthesis?.pass;
    // Each phase declares the artifacts it emits; the registry renders them.
    const artifacts = phase.synthesis?.artifacts ?? [];
    if (passName === 'synthesise-manifesto') {
      return synthesiseManifesto(deps, session, phase.phase, artifacts, steering);
    }
    throw new Error(`No synthesis pass registered for "${passName}" (phase ${phase.phase}).`);
  };
}

/** A one-line hint appended to the prompt for the review-gate redo choices. */
function steeringHint(steering: 'detail' | 'differently' | undefined): string {
  if (steering === 'detail') {
    return '\n\nThe user asked for MORE DETAIL. Expand the rationales and be more specific to this project.';
  }
  if (steering === 'differently') {
    return '\n\nThe user wants a DIFFERENT take. Rework the values and laws from a fresh angle.';
  }
  return '';
}

async function synthesiseManifesto(
  deps: SynthesiseDeps,
  session: MustardSession,
  phaseId: number,
  artifacts: readonly string[],
  steering: 'detail' | 'differently' | undefined,
): Promise<LlmOutcome<SynthesisOutput>> {
  const ps = phaseStateOf(session, phaseId);
  const input = {
    phase: phaseId,
    literacy: session.literacy,
    answers: projectAnswers(ps),
    steering: steering ?? null,
  };

  const meta: FrontmatterMeta = {
    phase: phaseId,
    sessionId: deriveSessionId(session),
    generatedAt: deps.now(),
    mustardVersion: deps.mustardVersion,
  };

  const basePrompt = `Synthesise the manifesto from these answers:\n\n${JSON.stringify(input.answers, null, 2)}`;

  // First attempt.
  let outcome = await deps.client.generate({
    pass: 'synthesise-manifesto',
    tier: 'deep',
    system: synthesiseManifestoPrompt,
    input,
    prompt: basePrompt + steeringHint(steering),
    schema: ManifestoArtifact,
    model: deps.model,
  });
  if (outcome.status !== 'ok') {
    return outcome; // degraded schema failure — runner renders raw answers
  }

  try {
    return { status: 'ok', value: renderOutput(deps, artifacts, outcome.value, meta) };
  } catch (err) {
    if (!(err instanceof CapExceededError)) {
      throw err;
    }
    // One corrective re-synthesis: tell the model exactly which cap it breached.
    outcome = await deps.client.generate({
      pass: 'synthesise-manifesto',
      tier: 'deep',
      system: synthesiseManifestoPrompt,
      input,
      prompt: `${basePrompt}${steeringHint(steering)}\n\nYour previous reply overshot a hard cap: ${err.message}. Return a shorter set that fits.`,
      schema: ManifestoArtifact,
      model: deps.model,
    });
    if (outcome.status !== 'ok') {
      return outcome;
    }
    try {
      return { status: 'ok', value: renderOutput(deps, artifacts, outcome.value, meta) };
    } catch (err2) {
      if (err2 instanceof CapExceededError) {
        return { status: 'degraded', reason: err2.message };
      }
      throw err2;
    }
  }
}

/**
 * Render a phase's declared artifacts via the registry (§9.4). Renderer cap
 * breaches surface as `CapExceededError` here, exactly as before the rewire.
 */
function renderOutput(
  deps: SynthesiseDeps,
  artifacts: readonly string[],
  obj: ManifestoArtifact,
  meta: FrontmatterMeta,
): SynthesisOutput {
  return { object: obj, artifacts: deps.registry.renderAll(artifacts, obj, meta) };
}

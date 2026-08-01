import { ManifestoArtifact } from '../schemas/manifesto.js';
import { Phase2Output } from '../schemas/phase2-output.js';
import { Phase3Output } from '../schemas/schema-model.js';
import { renderAiLaws } from './markdown/ai-laws.js';
import { renderManifesto } from './markdown/manifesto.js';
import { renderSchemas } from './markdown/schemas.js';
import { renderUseCases } from './markdown/use-cases.js';
import { RendererRegistry, defineRenderer } from './registry.js';

/**
 * Build the production renderer registry (§9.4). Each phase milestone adds its
 * renderers here — one `defineRenderer` line per artifact. Kept separate from
 * `registry.ts` so the registry class stays content-free and independently
 * testable.
 */
export function createRendererRegistry(): RendererRegistry {
  return new RendererRegistry().register([
    defineRenderer('01-MANIFESTO.md', ManifestoArtifact, renderManifesto),
    defineRenderer('01-AI-LAWS.md', ManifestoArtifact, renderAiLaws),
    defineRenderer('02-USE-CASES.md', Phase2Output, renderUseCases),
    defineRenderer('03-SCHEMAS.md', Phase3Output, renderSchemas),
    // M11: defineRenderer('04-STACK.md', z.array(StackDecision), renderStack), …
  ]);
}

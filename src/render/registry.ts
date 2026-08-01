import type { FrontmatterMeta } from './markdown/frontmatter.js';

/**
 * The renderer registry: artifact name → renderer. It replaces per-pass hardcoded
 * rendering so a phase's outputs are driven by its bank module's
 * `synthesis.artifacts` list (§9.4) — adding an artifact is a registration, not an
 * engine edit.
 *
 * Artifacts consume different typed objects (ManifestoArtifact, DomainExtraction,
 * UseCase[], StackDecision[]), and the runner hands the synthesised object across
 * as `unknown` (`PhaseState.synthesisedObject` is `z.unknown()`, §2.4). So each
 * entry narrows `unknown → T` exactly once, at the boundary, via the object's Zod
 * schema — reusing the universal contract and turning a mis-wire (wrong object for
 * an artifact) into a loud, tested failure rather than silent bad output.
 */

/** What a registered renderer produces: the artifact filename + its markdown body. */
export interface RenderedArtifact {
  name: string;
  body: string;
}

/** A type-erased entry: narrows `unknown` internally, then renders. */
export type RendererEntry = (object: unknown, meta: FrontmatterMeta) => RenderedArtifact;

/** A typed renderer as authored: receives the already-narrowed object. */
export type Renderer<T> = (object: T, meta: FrontmatterMeta) => string;

/** The minimal shape we need from a Zod schema — its `parse`. */
interface Parser<T> {
  parse(input: unknown): T;
}

/**
 * Author a registry entry. `schema.parse` is the single `unknown → T` narrow point;
 * `body` is the existing per-artifact markdown renderer, unchanged. Renderer errors
 * (e.g. `CapExceededError`) propagate to the caller — the registry never swallows.
 */
export function defineRenderer<T>(
  name: string,
  schema: Parser<T>,
  body: Renderer<T>,
): { name: string; entry: RendererEntry } {
  const entry: RendererEntry = (object, meta) => ({ name, body: body(schema.parse(object), meta) });
  return { name, entry };
}

/** Immutable-after-build registry of artifact renderers. */
export class RendererRegistry {
  private readonly map = new Map<string, RendererEntry>();

  /** Register one or more entries. Throws on a duplicate artifact name. */
  register(defs: ReadonlyArray<{ name: string; entry: RendererEntry }>): this {
    for (const { name, entry } of defs) {
      if (this.map.has(name)) {
        throw new Error(`Duplicate renderer registered for artifact "${name}".`);
      }
      this.map.set(name, entry);
    }
    return this;
  }

  has(name: string): boolean {
    return this.map.has(name);
  }

  /** Render one artifact by name. Throws loudly on an unregistered name. */
  render(name: string, object: unknown, meta: FrontmatterMeta): RenderedArtifact {
    const entry = this.map.get(name);
    if (entry === undefined) {
      throw new Error(`No renderer registered for artifact "${name}".`);
    }
    return entry(object, meta);
  }

  /** Render the full set a phase declares (`phase.synthesis.artifacts`), in order. */
  renderAll(names: readonly string[], object: unknown, meta: FrontmatterMeta): RenderedArtifact[] {
    return names.map((name) => this.render(name, object, meta));
  }
}

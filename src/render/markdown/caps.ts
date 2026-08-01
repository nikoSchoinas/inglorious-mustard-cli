/**
 * Output caps are enforced in the renderers, not trusted to the prompt
 * (technical-plan pitfall §7.9). When a rendered artifact would breach its cap the
 * renderer throws this typed error rather than truncating — the SYNTHESISE pass
 * catches it, re-synthesises once with a corrective hint, and falls back to a
 * degraded artifact only if the model still overshoots.
 */
export class CapExceededError extends Error {
  readonly artifact: string;
  readonly cap: string;
  constructor(artifact: string, cap: string, detail: string) {
    super(`${artifact} exceeds its ${cap} cap: ${detail}`);
    this.name = 'CapExceededError';
    this.artifact = artifact;
    this.cap = cap;
  }
}

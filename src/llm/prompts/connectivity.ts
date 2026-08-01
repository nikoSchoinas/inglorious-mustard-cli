import type { SystemPrompt } from './types.js';

/**
 * Minimal prompt for the Phase 0 connectivity check (spec §9.8): the smallest
 * possible structured call that proves the key works and the provider answers,
 * before any real question is asked. Kept trivial to spend near-zero tokens.
 */
export const connectivityPrompt: SystemPrompt = {
  id: 'connectivity',
  version: '1',
  text: 'You are a connectivity probe. Reply with the exact JSON object requested and nothing else.',
};

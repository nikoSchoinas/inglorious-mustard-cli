/**
 * Barrel for the frozen §9.3 data model. These Zod schemas are the universal
 * contract (technical-plan §2.1): session state, LLM output contract, renderer
 * input and fixture format. Nothing here may change without a `schemaVersion` bump.
 */
export * from './analysis.js';
export * from './architecture.js';
export * from './config.js';
export * from './extraction.js';
export * from './manifesto.js';
export * from './phase2-output.js';
export * from './schema-model.js';
export * from './session.js';
export * from './stack.js';
export * from './task.js';
export * from './use-case.js';

export {
  type GenerateArgs,
  LLMClient,
  type LLMClientOptions,
  type LlmOutcome,
  type LlmTier,
  LlmUnavailableError,
} from './client.js';
export {
  type CheckConnectivityOptions,
  checkConnectivity,
  type ConnectivityResult,
} from './connectivity.js';
export {
  computeFixtureKey,
  defaultFixturesRoot,
  type FixtureFile,
  type FixtureKey,
  type FixtureKeyInput,
  fixtureFilePath,
  readFixture,
  schemaHash,
  writeFixture,
} from './fixtures.js';
export {
  BUNDLED_MANIFEST,
  bundledDefaults,
  DEFAULT_MANIFEST_URL,
  fetchRemoteManifest,
  type ModelManifest,
  type ModelTierDefaults,
  providerDocsUrl,
} from './manifest.js';
export { connectivityPrompt } from './prompts/connectivity.js';
export type { SystemPrompt } from './prompts/types.js';
export {
  createModel,
  createModelForTier,
  modelIdFor,
  resolveModels,
} from './router.js';
export {
  FakeTransport,
  type FakeStep,
  FixtureCacheMissError,
  type LLMMode,
  type LLMTransport,
  modeFromEnv,
  RealTransport,
  RecordTransport,
  ReplayTransport,
  type TransportRequest,
  type TransportResult,
} from './transport.js';

import { defaultFixturesRoot } from './fixtures.js';
import { type LLMMode, RealTransport, RecordTransport, ReplayTransport } from './transport.js';

/**
 * Build the transport for a mode, wiring the fixtures root. `real` needs no root;
 * `record` wraps a real transport; `replay` reads fixtures only.
 */
export function createTransport(mode: LLMMode, fixturesRoot: string = defaultFixturesRoot()) {
  switch (mode) {
    case 'real':
      return new RealTransport();
    case 'record':
      return new RecordTransport(new RealTransport(), fixturesRoot);
    case 'replay':
      return new ReplayTransport(fixturesRoot);
  }
}

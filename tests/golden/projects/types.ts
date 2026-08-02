import type { FakeStep } from '../../../src/llm/transport.js';
import type { MustardConfig } from '../../../src/schemas/config.js';
import type { ScriptedStep } from '../../../src/ui/scripted-prompter.js';

/**
 * A golden project (technical-plan §5, M15): one graduated project description with a
 * fully scripted Phase 0→7 run. Authored as a typed TS module (not YAML) to match the
 * repo's existing `tests/golden/` pattern and get compile-time safety on the answer
 * scripts.
 *
 * `script` is the ScriptedPrompter answer stream; `fakeSteps` is the FakeTransport
 * response stream, in the exact order `driveMission` calls the LLM passes across all
 * seven phases. Offline (`pnpm test`) the two drive one deterministic mission; nightly
 * the same `script` runs against a real transport so prompt edits move the judge score.
 */
export interface GoldenProject {
  /** Stable id, e.g. `01-habit-tracker`. */
  id: string;
  title: string;
  /** The Phase 2 capture text — also handed to the judge as grounding context. */
  description: string;
  /** Fixed provider/models. In replay/fake mode no real key is needed. */
  config: MustardConfig;
  /** The full Phase 0→7 ScriptedPrompter answer stream. */
  script: ScriptedStep[];
  /** The FakeTransport response stream in pass-call order (offline runs only). */
  fakeSteps: FakeStep[];
  /** Actors the rubric expects to see covered (documentation + future assertions). */
  expectedActors: string[];
  /** `needs.*` facts the stack must satisfy (documentation + future assertions). */
  expectedNeeds: string[];
}

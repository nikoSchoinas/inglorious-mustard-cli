import type { FakeStep } from '../../../src/llm/transport.js';
import type { ScriptedStep } from '../../../src/ui/scripted-prompter.js';
import {
  CANNED_ANALYSE,
  CANNED_MANIFESTO,
  CONFIG,
  FULL_SCRIPT as P0_P1,
} from '../phase1-skeleton.js';
import {
  CANNED_CAPS_MEMBER,
  CANNED_EXTRACT,
  CAPTURE,
  FULL_SCRIPT as P2A,
} from '../phase2a-fixture.js';
import { FULL_2B_SCRIPT as P2B, FAKE_STEPS as P2B_FAKE } from '../phase2b-fixture.js';
import { FAKE_STEPS as P4_FAKE } from '../phase4-fixture.js';
import { FULL_5_SCRIPT as P5, FAKE_STEPS as P5_FAKE } from '../phase5-fixture.js';
import { FULL_6_SCRIPT as P6, FAKE_STEPS as P6_FAKE } from '../phase6-fixture.js';
import { FULL_7_SCRIPT as P7 } from '../phase7-fixture.js';
import type { GoldenProject } from './types.js';

/**
 * Golden project #1 — the single-user habit tracker (technical-plan §4/§5). Assembled by
 * threading the existing per-phase golden constants through ONE cumulative mission, so the
 * full-mission run stays in lockstep with the per-phase acceptance tests.
 *
 * Phase 3 is the one place the threaded state diverges from the per-phase fixture: a real
 * mission carries the Phase 2A extraction forward (high-confidence relationships, no enum
 * attributes), so Phase 3 asks only the retention question — no cardinality confirms, no
 * enum discovery, and no LLM call. Its script is therefore authored inline here.
 */

/** Phase 3 asks only retention here (no ambiguous cardinality, no enum attributes). */
const P3: ScriptedStep[] = [
  { kind: 'select', value: 'recoverable' }, // p3.retention
  { kind: 'select', value: 'accept' }, // review 03-SCHEMAS.md
];

/**
 * Phase 4 authored inline so the business answers stay CONSISTENT with the canned stack
 * proposal (`P4_FAKE`): the habit tracker takes uploads (→ storage) and email/password
 * auth (→ auth), but does NOT send email or run background work — so every active
 * `needs.*` fact has a matching stack category and the needs→stack rubric holds. The
 * decision-loop and write steps mirror the per-phase phase-4 fixture (all four review
 * branches over the four canned decisions).
 */
const P4: ScriptedStep[] = [
  // SEED — context + the ten business questions (p4.concurrent skipped: one actor).
  { kind: 'select', value: 'web' }, // p4.run-target
  { kind: 'select', value: 'hundreds' }, // p4.scale
  { kind: 'select', value: 'personal' }, // p4.sensitivity
  { kind: 'select', value: 'one-country' }, // p4.user-location
  { kind: 'confirm', value: true }, // p4.uploads → needs.objectStorage
  { kind: 'confirm', value: false }, // p4.payments
  { kind: 'confirm', value: false }, // p4.email (no email → no email decision needed)
  { kind: 'confirm', value: false }, // p4.background (no workers → no queue needed)
  { kind: 'confirm', value: false }, // p4.inference
  { kind: 'select', value: 'email-password' }, // p4.auth → needs.auth
  { kind: 'confirm', value: false }, // p4.offline
  { kind: 'confirm', value: false }, // p4.search
  { kind: 'confirm', value: false }, // p4.admin
  // DECISION loop — one branch per canned decision (§8.7).
  { kind: 'select', value: 'explain-more' }, // decision 0: ask for more…
  { kind: 'select', value: 'accept' }, // …then accept
  { kind: 'select', value: 'accept' }, // decision 1
  { kind: 'select', value: 'choose-alternative' }, // decision 2: swap…
  { kind: 'select', value: 'Cloudflare R2' }, // …first alternative
  { kind: 'select', value: 'already-decided' }, // decision 3: override…
  { kind: 'text', value: 'Auth0' }, // …locked choice
  // WRITE — review 04-STACK.md then 03-STRUCTURE.md.
  { kind: 'select', value: 'accept' },
  { kind: 'select', value: 'accept' },
];

/** The FakeTransport responses in the exact order `driveMission` calls the passes. */
const FAKE_STEPS: FakeStep[] = [
  // Phase 1: ANALYSE (ready) → SYNTHESISE.
  { kind: 'object', value: CANNED_ANALYSE },
  { kind: 'object', value: CANNED_MANIFESTO },
  // Phase 2A: EXTRACT → one suggest-capabilities call for the single confirmed actor.
  { kind: 'object', value: CANNED_EXTRACT },
  { kind: 'object', value: CANNED_CAPS_MEMBER },
  // Phase 2B: happy×3, (failure-questions, failure-structure)×3, order.
  ...P2B_FAKE,
  // Phase 3: no LLM calls (no enums, no ambiguous relationships).
  // Phase 4: propose-stack → explain-stack → propose-structure.
  ...P4_FAKE,
  // Phase 5: ANALYSE → synthesise-architecture.
  ...P5_FAKE,
  // Phase 6: ANALYSE → sequence.
  ...P6_FAKE,
];

export const habitTracker: GoldenProject = {
  id: '01-habit-tracker',
  title: 'Habit Tracker',
  description: CAPTURE,
  config: CONFIG,
  script: [...P0_P1, ...P2A, ...P2B, ...P3, ...P4, ...P5, ...P6, ...P7],
  fakeSteps: FAKE_STEPS,
  expectedActors: ['Member'],
  expectedNeeds: ['needs.objectStorage', 'needs.auth'],
};

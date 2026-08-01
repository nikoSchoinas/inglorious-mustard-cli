import type { Phase } from '../types.js';

/**
 * Phase 5 — Architecture (spec §8.8, "mostly derived"). Almost everything this
 * phase needs — auth model, background/scheduled work, storage, data models,
 * stack — already arrived as derived facts and typed outputs from Phases 2–4;
 * asking again would be repetition, which the book treats as a wandering
 * interrogation. So Phase 5 asks only the TWO questions the earlier phases
 * cannot answer, both plain-language:
 *   - `p5.heavy-work`  → is anything heavy done, and client- or server-side?
 *   - `p5.data-sharing`→ is any data shared between users, or all private?
 *
 * Everything else — the component diagram, the sequence diagrams for the riskiest
 * flows, the ADR log, and the three irreversible decisions — is produced by the
 * deep `synthesise-architecture` pass. Like Phase 3/4 this is a BESPOKE
 * orchestrator (`engine/phase-5.ts`): the per-decision irreversibility confirm
 * gate is not the generic full-artifact review gate, so it does not fit
 * `runPhase`. Question STRINGS still live here (the M2 tripwire holds).
 *
 * `followUpPolicy` is capped low: Phase 5 is derivation, not interrogation, and
 * repetition is a wandering interrogation (§8.8). Emits `05-ARCHITECTURE.md`
 * (diagrams) and `05-DECISIONS.md` (ADR log + irreversible decisions).
 */
export const phase5: Phase = {
  phase: 5,
  name: 'Architecture',
  seed: [
    {
      id: 'p5.heavy-work',
      type: 'select',
      mapsTo: 'arch.heavyWork',
      prompt: {
        none: 'Does the app ever do anything heavy — like processing video, making big exports, or asking an AI model to think? And should that happen on the person’s own device or on your server?',
        some: 'Anything heavy (video processing, large exports, model inference)? Client- or server-side?',
        developer: 'Heavy compute (media processing, large exports, inference) — client or server?',
      },
      help: 'Heavy work on the server costs you money but keeps phones cool; on the device it is free to you but slower and drains battery.',
      options: [
        { value: 'none', label: 'Nothing heavy — it is all quick, simple actions' },
        { value: 'client', label: 'Yes, and it should run on the person’s own device' },
        { value: 'server', label: 'Yes, and it should run on the server' },
        { value: 'both', label: 'Both — some on the device, some on the server' },
      ],
    },
    {
      id: 'p5.data-sharing',
      type: 'confirm',
      mapsTo: 'arch.dataSharing',
      prompt: {
        none: 'Does any information need to be shared between different people using the app — or does everyone only ever see their own things?',
        some: 'Is any data shared between users, or is everything private per-user?',
        developer: 'Cross-user shared data, or strictly per-user isolation?',
      },
      help: 'Shared things — documents, posts, messages, bookings — need rules for who wins when two people touch them; private-only data does not.',
    },
  ],
  followUpPolicy: { maxGenerated: 2, onlySeverity: ['blocking', 'important'] },
  synthesis: {
    pass: 'synthesise-architecture',
    model: 'deep',
    artifacts: ['05-ARCHITECTURE.md', '05-DECISIONS.md'],
  },
};

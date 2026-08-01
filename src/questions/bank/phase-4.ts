import { fact } from '../fact.js';
import type { Phase } from '../types.js';

/**
 * Phase 4 — Tools & Technologies (spec §8.7, "proposal mode"). Phase 4 asks ONLY
 * business questions a non-technical builder can answer; the `propose-stack` pass
 * translates the resulting `needs.*` facts and `context.*` answers into a concrete
 * stack (§4.2). The ten business questions below determine most of a small
 * product's stack; the four context selects sharpen the proposals.
 *
 * Every answer `mapsTo` a fact the deep `propose-stack` pass reads — this bank is
 * where the "ten business questions" of §4.2 live. The `p4.uploads` / `p4.concurrent`
 * pair is the §9.4 seed, kept verbatim; the rest follow the same three-register form.
 *
 * Like Phase 2/3 this is a BESPOKE orchestrator (`engine/phase-4.ts`): the SEED
 * questions are static (here), but the per-decision proposal review is not the
 * generic full-artifact review gate. No ANALYSE/FOLLOW-UP loop, so the policy is
 * empty. Emits `04-STACK.md` AND the deferred `03-STRUCTURE.md` (pitfall §7.1) —
 * the artifact set is declared here, the single source of truth.
 */
export const phase4: Phase = {
  phase: 4,
  name: 'Tools & Technologies',
  seed: [
    // ---- Context (§8.7) --------------------------------------------------
    {
      id: 'p4.run-target',
      type: 'select',
      mapsTo: 'context.runTarget',
      prompt: {
        none: 'Where will people use this?',
        some: 'Where does this run?',
        developer: 'Primary run target?',
      },
      options: [
        { value: 'web', label: 'In a web browser' },
        { value: 'mobile', label: 'As a phone app' },
        { value: 'both', label: 'Both web and phone' },
        { value: 'desktop', label: 'As a desktop app' },
        { value: 'cli', label: 'From the command line' },
        { value: 'api', label: "It's an API — no screens of its own" },
      ],
    },
    {
      id: 'p4.scale',
      type: 'select',
      mapsTo: 'context.scale',
      prompt: {
        none: 'Roughly how many people do you expect to use this in the first year?',
        some: 'Expected scale in year one?',
        developer: 'Year-one scale?',
      },
      options: [
        { value: 'just-me', label: 'Just me' },
        { value: 'tens', label: 'Tens of people' },
        { value: 'hundreds', label: 'Hundreds' },
        { value: 'thousands', label: 'Thousands' },
        { value: 'more', label: 'More than that' },
      ],
    },
    {
      id: 'p4.sensitivity',
      type: 'select',
      mapsTo: 'context.sensitivity',
      prompt: {
        none: 'What kind of information will this hold about people?',
        some: 'How sensitive is the data?',
        developer: 'Data sensitivity class?',
      },
      help: 'Regulated means health, finance, or anything about children.',
      options: [
        { value: 'public', label: 'Nothing private — public information only' },
        { value: 'personal', label: 'Personal details (names, emails, their own content)' },
        { value: 'regulated', label: 'Regulated data (health, finance, or children)' },
      ],
    },
    {
      id: 'p4.user-location',
      type: 'select',
      mapsTo: 'context.userLocation',
      prompt: {
        none: 'Where in the world are the people who will use this?',
        some: 'Where are your users?',
        developer: 'User geography?',
      },
      help: 'This affects speed and where data is allowed to live.',
      options: [
        { value: 'one-country', label: 'Mostly one country' },
        { value: 'one-region', label: 'One region (e.g. Europe, North America)' },
        { value: 'global', label: 'All over the world' },
      ],
    },

    // ---- The ten business questions (§4.2) -------------------------------
    {
      id: 'p4.uploads',
      type: 'confirm',
      mapsTo: 'needs.objectStorage',
      prompt: {
        none: 'Will people using your app upload photos, videos, or files?',
        some: 'Do users upload media or files?',
        developer: 'User-generated file uploads?',
      },
      help: 'Profile pictures count. So do PDFs, voice notes, and CSV imports.',
    },
    {
      id: 'p4.concurrent',
      type: 'select',
      mapsTo: 'needs.concurrency',
      when: (facts) => Number(fact(facts, 'actorCount', 0)) > 1,
      prompt: {
        none: 'Will two different people ever change the same thing at the same time?',
        some: 'Will two people ever edit the same record at once?',
        developer: 'Concurrent write contention on shared records?',
      },
      options: [
        { value: 'never', label: 'No — everyone has their own stuff' },
        { value: 'sometimes', label: 'Sometimes — e.g. shared documents or bookings' },
        { value: 'core', label: "Constantly — it's the point of the product" },
      ],
    },
    {
      id: 'p4.payments',
      type: 'confirm',
      mapsTo: 'needs.payments',
      prompt: {
        none: 'Will people pay money through the app?',
        some: 'Do you take payments?',
        developer: 'Payment processing at runtime?',
      },
      help: 'Subscriptions, one-off purchases, or paying other users all count.',
    },
    {
      id: 'p4.email',
      type: 'confirm',
      mapsTo: 'needs.email',
      prompt: {
        none: 'Will the app send emails or notifications to people?',
        some: 'Do you send email or notifications?',
        developer: 'Transactional email / push notifications?',
      },
      help: 'Password resets, receipts, reminders, "someone replied" alerts.',
    },
    {
      id: 'p4.background',
      type: 'confirm',
      mapsTo: 'needs.background',
      prompt: {
        none: 'Does anything need to happen while nobody is using the app?',
        some: 'Any scheduled or background work?',
        developer: 'Background workers / scheduled jobs?',
      },
      help: 'Daily digests, cleanups, reminders that fire on their own, imports that run overnight.',
    },
    {
      id: 'p4.inference',
      type: 'confirm',
      mapsTo: 'needs.inference',
      prompt: {
        none: 'Does the app use AI while people are using it?',
        some: 'Does anything call an AI model at runtime?',
        developer: 'Runtime model inference?',
      },
      help: 'Chatbots, summaries, image generation, smart search — anything that asks an AI model a question live.',
    },
    {
      id: 'p4.auth',
      type: 'select',
      mapsTo: 'needs.auth',
      prompt: {
        none: 'Do people sign in? And would they expect a "Sign in with Google / Apple" button?',
        some: 'How do users sign in?',
        developer: 'Auth model?',
      },
      options: [
        { value: 'none', label: 'No sign-in at all' },
        { value: 'email-password', label: 'Email and password' },
        { value: 'magic-link', label: 'A login link sent to their email' },
        { value: 'social', label: 'Sign in with Google / Apple / etc.' },
        { value: 'both', label: 'Both a password and social sign-in' },
      ],
    },
    {
      id: 'p4.offline',
      type: 'confirm',
      mapsTo: 'needs.offline',
      prompt: {
        none: 'Does it need to work with a bad or missing internet connection?',
        some: 'Offline support required?',
        developer: 'Offline-first / sync?',
      },
      help: 'Think a note-taking app on a plane, or a field-work app with no signal.',
    },
    {
      id: 'p4.search',
      type: 'confirm',
      mapsTo: 'needs.search',
      prompt: {
        none: 'Will people search through the content in the app?',
        some: 'Do users search the content?',
        developer: 'Full-text search over content?',
      },
      help: 'A search box that looks inside what users have created, not just filtering a short list.',
    },
    {
      id: 'p4.admin',
      type: 'confirm',
      mapsTo: 'needs.admin',
      prompt: {
        none: 'Will you need a way to manage users or content behind the scenes?',
        some: 'Do you need an admin surface?',
        developer: 'Admin / moderation surface with roles?',
      },
      help: 'A back office to ban a user, remove a post, or fix bad data.',
    },
  ],
  followUpPolicy: { maxGenerated: 0, onlySeverity: [] },
  synthesis: {
    pass: 'propose-stack',
    model: 'deep',
    artifacts: ['04-STACK.md', '03-STRUCTURE.md'],
  },
};

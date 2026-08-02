import { habitTracker } from './01-habit-tracker.js';
import type { GoldenProject } from './types.js';

/**
 * The golden-project registry (technical-plan §5, M15). Project #1 is fully wired end to
 * end; the remaining nine graduated projects (two-sided marketplace, internal CSV tool,
 * offline-sync mobile app, regulated health app, …) are the incremental content workstream
 * — each authored by extending this registry with a new `GoldenProject` module, exactly as
 * `01-habit-tracker.ts` threads the per-phase constants through one mission.
 */
export const GOLDEN_PROJECTS: GoldenProject[] = [habitTracker];

/** Ids of the graduated projects still to be authored (§5 follow-on), for honest logging. */
export const PENDING_PROJECT_IDS = [
  '02-two-sided-marketplace',
  '03-internal-csv-tool',
  '04-offline-sync-mobile',
  '05-regulated-health-app',
  '06-realtime-collab-doc',
  '07-content-subscription',
  '08-booking-system',
  '09-ai-assistant',
  '10-social-feed',
] as const;

/**
 * A deliberate, user-facing stop of the mission: the session is persisted and
 * resumable, but continuing right now would produce a worthless bundle (e.g.
 * Phase 2 ended with zero use cases). The command layer prints `message` without
 * a stack trace and exits 1 — unlike a real failure, which propagates loudly.
 */
export class MissionHaltError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissionHaltError';
  }
}

import { Literacy, MustardSession } from '../schemas/session.js';

/**
 * The runner records answers into `facts` but never touches the session's
 * top-level identity fields (`literacy`, `agentTarget`, `projectName`). Those are
 * set here, from the facts a phase produced, after each phase completes.
 *
 * This matters beyond bookkeeping: the runner phrases every question using the
 * top-level `session.literacy` (runner.ts `ask`), and Phase 0 captures literacy as
 * a *fact* — so without this sync, Phase 1 would be phrased at the default `none`
 * register regardless of what the user chose. Pure: returns a new session.
 */
export function syncSessionIdentity(session: MustardSession): MustardSession {
  const next = { ...session };

  const literacy = Literacy.safeParse(session.facts.literacy);
  if (literacy.success) {
    next.literacy = literacy.data;
  }

  const agentTarget = MustardSession.shape.agentTarget.safeParse(session.facts['agent.target']);
  if (agentTarget.success) {
    next.agentTarget = agentTarget.data;
  }

  const name = session.facts.projectName;
  if (typeof name === 'string' && name.trim().length > 0) {
    next.projectName = name;
  }

  return next;
}

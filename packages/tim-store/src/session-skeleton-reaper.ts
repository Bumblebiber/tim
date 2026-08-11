import type { TimStore } from './store.js';
import { SessionManager } from './session.js';

export interface SessionSkeletonReapReport {
  checkpointsReaped: number;
}

/** Session-skeleton sweep (P0063 item 21): reap disposable checkpoint nodes. */
export async function reapSessionSkeletons(store: TimStore): Promise<SessionSkeletonReapReport> {
  const sessions = new SessionManager(store);
  const checkpointsReaped = await sessions.reapCoveredCheckpoints();
  return { checkpointsReaped };
}

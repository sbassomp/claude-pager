import type { PendingQuestion } from '../types.js';

export type SessionState = 'working' | 'waiting_input' | 'waiting_permission' | 'idle' | 'unknown';

/**
 * A pending question overrides the transcript-derived state: Claude Code is
 * blocked on the user, whatever the transcript's last entry suggests.
 */
export function deriveSessionState(transcriptState: SessionState, pending: PendingQuestion | undefined): SessionState {
  if (!pending) return transcriptState;
  return pending.event.type === 'permission_prompt' ? 'waiting_permission' : 'waiting_input';
}

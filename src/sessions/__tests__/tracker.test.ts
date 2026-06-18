import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { SessionInfo } from '../../types.js';

async function loadTracker() {
  const { isProcessAlive, isSessionAlive } = await import('../tracker.js');
  return { isProcessAlive, isSessionAlive };
}

function tmuxSession(overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    sessionId: 'abc',
    pid: process.pid,
    tty: '',
    cwd: '/tmp',
    tmuxPane: '%9',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('session tracker', () => {
  describe('isProcessAlive', () => {
    it('should return true for current process', async () => {
      const { isProcessAlive } = await loadTracker();
      assert.equal(isProcessAlive(process.pid), true);
    });

    it('should return false for non-existent PID', async () => {
      const { isProcessAlive } = await loadTracker();
      assert.equal(isProcessAlive(99999999), false);
    });
  });

  describe('isSessionAlive', () => {
    it('keeps a tmux session whose pane is in the live set', async () => {
      const { isSessionAlive } = await loadTracker();
      assert.equal(isSessionAlive(tmuxSession({ tmuxPane: '%9' }), new Set(['%9', '%2'])), true);
    });

    it('reaps a tmux session whose pane is definitively gone', async () => {
      const { isSessionAlive } = await loadTracker();
      assert.equal(isSessionAlive(tmuxSession({ tmuxPane: '%9' }), new Set(['%2'])), false);
    });

    it('NEVER reaps a tmux session when tmux is unreachable (livePanes null)', async () => {
      const { isSessionAlive } = await loadTracker();
      // This is the regression guard: a transient tmux failure must not delete
      // a still-running session that would never get re-registered.
      assert.equal(isSessionAlive(tmuxSession({ tmuxPane: '%9' }), null), true);
    });

    it('reaps any session registered before the last boot, even if tmux is down', async () => {
      const { isSessionAlive } = await loadTracker();
      assert.equal(isSessionAlive(tmuxSession({ tmuxPane: '%9', timestamp: 1 }), null), false);
    });

    it('falls back to the process check for non-tmux sessions', async () => {
      const { isSessionAlive } = await loadTracker();
      assert.equal(
        isSessionAlive(tmuxSession({ tmuxPane: undefined, pid: process.pid }), new Set()),
        true,
      );
      assert.equal(
        isSessionAlive(tmuxSession({ tmuxPane: undefined, pid: 99999999 }), new Set()),
        false,
      );
    });
  });
});

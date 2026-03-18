import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// We need to mock the data dir before importing tracker
let testDir: string;

// Dynamic import after env setup
async function loadTracker() {
  // We'll test the logic directly by writing/reading files
  const { registerSession, getSession, listSessions, isProcessAlive, cleanDeadSessions } = await import('../tracker.js');
  return { registerSession, getSession, listSessions, isProcessAlive, cleanDeadSessions };
}

describe('session tracker', () => {
  // Since the tracker uses getDataDir() which reads from config,
  // we test the core logic with a simulated environment

  describe('isProcessAlive', () => {
    it('should return true for current process', async () => {
      const { isProcessAlive } = await loadTracker();
      assert.equal(isProcessAlive(process.pid), true);
    });

    it('should return false for non-existent PID', async () => {
      const { isProcessAlive } = await loadTracker();
      // PID 99999999 is extremely unlikely to exist
      assert.equal(isProcessAlive(99999999), false);
    });
  });
});

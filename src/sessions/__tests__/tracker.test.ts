import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

async function loadTracker() {
  const { isProcessAlive } = await import('../tracker.js');
  return { isProcessAlive };
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
});

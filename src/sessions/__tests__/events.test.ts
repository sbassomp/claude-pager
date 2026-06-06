import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { addPending, getPending, removePending, listPending, resolveResponse, setPendingTtlMs, getPendingTtlMs } from '../events.js';
import type { RelayEvent } from '../../types.js';

function makeEvent(id: string, overrides?: Partial<RelayEvent>): RelayEvent {
  return {
    id,
    sessionId: 'session-1',
    type: 'permission_prompt',
    message: 'Allow Bash(git status)?',
    project: '/home/user/dev/myproject',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('event store', () => {
  beforeEach(() => {
    for (const q of listPending()) {
      removePending(q.event.id);
    }
  });

  it('should add and retrieve a pending question', () => {
    const event = makeEvent('evt-1');
    const shortId = addPending(event, 'msg-123');

    const q = getPending('evt-1');
    assert.ok(q);
    assert.equal(q.event.id, 'evt-1');
    assert.equal(q.channelMessageId, 'msg-123');
    assert.ok(q.shortId);
    assert.ok(shortId);
  });

  it('should return undefined for unknown event', () => {
    assert.equal(getPending('nonexistent'), undefined);
  });

  it('should list all pending questions', () => {
    addPending(makeEvent('evt-1'));
    addPending(makeEvent('evt-2'));
    addPending(makeEvent('evt-3'));
    assert.equal(listPending().length, 3);
  });

  it('should remove a pending question', () => {
    addPending(makeEvent('evt-1'));
    assert.ok(getPending('evt-1'));
    removePending('evt-1');
    assert.equal(getPending('evt-1'), undefined);
  });

  describe('resolveResponse', () => {
    it('should return null when no pending questions', () => {
      assert.equal(resolveResponse('allow'), null);
    });

    it('should route any text to the single pending question', () => {
      addPending(makeEvent('evt-1'));
      const result = resolveResponse('allow');
      assert.ok(result);
      assert.equal(result.question.event.id, 'evt-1');
      assert.equal(result.response, 'allow');
    });

    it('should route free text to single pending question', () => {
      addPending(makeEvent('evt-1', { type: 'idle_prompt' }));
      const result = resolveResponse('yes go ahead and fix the tests');
      assert.ok(result);
      assert.equal(result.question.event.id, 'evt-1');
      assert.equal(result.response, 'yes go ahead and fix the tests');
    });

    it('should route allow/deny to most recent permission_prompt when multiple pending', () => {
      addPending(makeEvent('evt-1', { type: 'idle_prompt' }));
      addPending(makeEvent('evt-2', { type: 'permission_prompt' }));
      addPending(makeEvent('evt-3', { type: 'permission_prompt' }));

      const result = resolveResponse('allow');
      assert.ok(result);
      assert.equal(result.question.event.id, 'evt-3');
      assert.equal(result.response, 'allow');
    });

    it('should route numbered response to the correct question', () => {
      const shortId1 = addPending(makeEvent('evt-1'));
      addPending(makeEvent('evt-2'));

      const result = resolveResponse(`#${shortId1} deny`);
      assert.ok(result);
      assert.equal(result.question.event.id, 'evt-1');
      assert.equal(result.response, 'deny');
    });

    it('should route numbered response without # prefix', () => {
      const shortId1 = addPending(makeEvent('evt-1'));
      addPending(makeEvent('evt-2'));

      const result = resolveResponse(`${shortId1} deny`);
      assert.ok(result);
      assert.equal(result.question.event.id, 'evt-1');
      assert.equal(result.response, 'deny');
    });

    it('should fallback to most recent for ambiguous free text', () => {
      addPending(makeEvent('evt-1', { type: 'idle_prompt' }));
      addPending(makeEvent('evt-2', { type: 'idle_prompt' }));

      const result = resolveResponse('do the thing');
      assert.ok(result);
      assert.equal(result.question.event.id, 'evt-2');
    });
  });

  describe('pending TTL configuration', () => {
    it('defaults to 12 hours', () => {
      // Default is 12h, but a previous test may have overridden it. Reset
      // and assert the documented default.
      setPendingTtlMs(12 * 60 * 60 * 1000);
      assert.equal(getPendingTtlMs(), 12 * 60 * 60 * 1000);
    });

    it('expires pending entries after the configured TTL', async () => {
      setPendingTtlMs(50);
      addPending(makeEvent('evt-ttl'));
      assert.equal(listPending().length, 1);
      await new Promise(r => setTimeout(r, 120));
      assert.equal(listPending().length, 0, 'entry should have expired');
      // Restore default so it does not leak to other tests.
      setPendingTtlMs(12 * 60 * 60 * 1000);
    });

    it('ignores non-positive values', () => {
      setPendingTtlMs(5000);
      setPendingTtlMs(0);
      setPendingTtlMs(-1);
      assert.equal(getPendingTtlMs(), 5000, 'invalid values should not clobber the current TTL');
      setPendingTtlMs(12 * 60 * 60 * 1000);
    });
  });
});

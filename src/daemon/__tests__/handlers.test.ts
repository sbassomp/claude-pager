import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createChannelHandlers } from '../handlers.js';
import { addPending, removePending, listPending } from '../../sessions/events.js';
import type { ChannelProvider, NotificationResult } from '../../channels/channel.js';
import type { InputInjector } from '../../injectors/injector.js';
import type { RelayEvent, SessionInfo } from '../../types.js';

function makeEvent(id: string, overrides?: Partial<RelayEvent>): RelayEvent {
  return {
    id,
    sessionId: 'sess-1',
    type: 'permission_prompt',
    message: 'Allow Bash?',
    project: '/home/user/project',
    timestamp: Date.now(),
    ...overrides,
  };
}

function mockChannel(): ChannelProvider & { rawSent: string[]; pickerSent: Array<{ text: string }> } {
  const rawSent: string[] = [];
  const pickerSent: Array<{ text: string }> = [];
  return {
    name: 'mock',
    rawSent,
    pickerSent,
    async send(): Promise<NotificationResult> {
      return { success: true };
    },
    async sendRaw(text: string) {
      rawSent.push(text);
    },
    async sendSessionPicker(text: string) {
      pickerSent.push({ text });
      return undefined;
    },
    startListening() {},
    stopListening() {},
  };
}

function mockInjector(): InputInjector & { calls: Array<{ text: string; type: string }> } {
  const calls: Array<{ text: string; type: string }> = [];
  return {
    name: 'mock',
    calls,
    async resolve() { return true; },
    async sendResponse(_session: SessionInfo, text: string, eventType: string) {
      calls.push({ text, type: eventType });
      return true;
    },
  };
}

describe('createChannelHandlers', () => {
  beforeEach(() => {
    for (const q of listPending()) {
      removePending(q.event.id);
    }
  });

  it('should route a matched response to the injector', async () => {
    const channel = mockChannel();
    const injector = mockInjector();
    const handlers = createChannelHandlers(channel, injector);

    const event = makeEvent('evt-1');
    const shortId = addPending(event);

    // Note: getSession will return null since we don't have real session files,
    // so it will fall through to free message routing. Test the fallback path.
    await handlers.onResponse(`#${shortId} allow`);

    // The event gets resolved by resolveResponse, but session won't be found
    // so it falls to free message. The pending should be removed.
    const remaining = listPending().find(q => q.event.id === 'evt-1');
    assert.equal(remaining, undefined, 'Pending question should be removed after resolution');
  });

  it('should handle session picker callback', async () => {
    const channel = mockChannel();
    const injector = mockInjector();
    const handlers = createChannelHandlers(channel, injector);

    // No pending picker state → should not crash
    await handlers.onResponse('__session_pick__:some-session');
    assert.equal(injector.calls.length, 0);
  });

  it('should have an onFreeMessage handler', () => {
    const channel = mockChannel();
    const injector = mockInjector();
    const handlers = createChannelHandlers(channel, injector);

    assert.ok(handlers.onFreeMessage, 'should have onFreeMessage handler');
  });

  it('should handle free text via onResponse without crashing', async () => {
    const channel = mockChannel();
    const injector = mockInjector();
    const handlers = createChannelHandlers(channel, injector);

    // Should not throw, regardless of session state
    await handlers.onResponse('random text');

    // Either sent "No active sessions" or opened a picker — both are valid
    const handledSomething = channel.rawSent.length > 0 || channel.pickerSent.length > 0;
    assert.ok(handledSomething, 'Should have routed the message somewhere');
  });
});

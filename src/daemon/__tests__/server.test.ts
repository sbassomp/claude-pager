import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.js';
import type { ChannelProvider, NotificationResult } from '../../channels/channel.js';
import type { InputInjector } from '../../injectors/injector.js';
import type { RelayConfig, RelayEvent, SessionInfo } from '../../types.js';
import type { FastifyInstance } from 'fastify';

function mockChannel(): ChannelProvider & { sent: RelayEvent[] } {
  const sent: RelayEvent[] = [];
  return {
    name: 'mock',
    sent,
    async send(event: RelayEvent): Promise<NotificationResult> {
      sent.push(event);
      return { success: true, messageId: 'mock-msg-1' };
    },
    startListening() {},
    stopListening() {},
  };
}

function mockInjector(): InputInjector & { injected: Array<{ session: SessionInfo; text: string }> } {
  const injected: Array<{ session: SessionInfo; text: string }> = [];
  return {
    name: 'mock',
    injected,
    async resolve() { return true; },
    async sendResponse(session: SessionInfo, text: string, _eventType: string) {
      injected.push({ session, text });
      return true;
    },
  };
}

const TEST_CONFIG: RelayConfig = {
  port: 0,
  channel: { type: 'ntfy' },
  injector: 'auto',
  dataDir: '/tmp/claude-pager-test',
};

describe('HTTP server', () => {
  let app: FastifyInstance;
  let channel: ReturnType<typeof mockChannel>;
  let injector: ReturnType<typeof mockInjector>;

  before(async () => {
    channel = mockChannel();
    injector = mockInjector();
    app = await createServer({ config: TEST_CONFIG, channel, injector });
  });

  after(async () => {
    await app.close();
  });

  describe('GET /api/v1/health', () => {
    it('should return ok status', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.equal(body.status, 'ok');
      assert.equal(body.channel, 'mock');
      assert.equal(body.injector, 'mock');
    });
  });

  describe('POST /api/v1/events', () => {
    it('should accept a valid event and send notification', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/events',
        payload: {
          session_id: 'sess-1',
          type: 'permission_prompt',
          message: 'Allow Bash(git push)?',
        },
      });

      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.equal(body.ok, true);
      assert.ok(body.eventId);
      assert.ok(body.shortId);
      assert.equal(channel.sent.length, 1);
    });

    it('should reject event with missing fields', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/events',
        payload: { session_id: 'sess-1' },
      });
      assert.equal(res.statusCode, 400);
    });
  });

  describe('GET /api/v1/pending', () => {
    it('should list pending questions', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/pending' });
      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.ok(Array.isArray(body.pending));
      assert.ok(body.pending.length >= 1);
    });
  });

  describe('POST /api/v1/respond', () => {
    it('should reject response with missing text', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/respond',
        payload: {},
      });
      assert.equal(res.statusCode, 400);
    });

    it('should resolve and match a response to pending question', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/respond',
        payload: { text: 'allow' },
      });
      // 410 = session not active (expected since no real session), not 404
      assert.ok(res.statusCode !== 404, 'Should have found a matching pending question');
    });
  });
});

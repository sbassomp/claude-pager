import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseKaConfig } from '../config.js';
import { toOutcome } from '../client.js';
import type { KaSendOutcome, KaSessionUpdate } from '../client.js';
import { remotePath, shortQuestion } from '../snapshot.js';
import { SessionStatePublisher } from '../publisher.js';
import type { SessionSnapshot } from '../publisher.js';

describe('Ka config', () => {
  it('parses url and token, trimming the trailing slash', () => {
    const cfg = parseKaConfig('# Ka\nurl=https://ka.example.org/\ntoken=abc=def\n');
    assert.deepEqual(cfg, { url: 'https://ka.example.org', token: 'abc=def' });
  });

  it('returns null when a key is missing', () => {
    assert.equal(parseKaConfig('url=https://ka.example.org\n'), null);
  });
});

describe('Ka response mapping', () => {
  it('maps 202 to sent', () => {
    assert.deepEqual(toOutcome(202, null), { status: 'sent' });
  });

  it('honours Retry-After on 429', () => {
    assert.deepEqual(toOutcome(429, '12'), { status: 'retry', afterMs: 12_000 });
  });

  it('retries 5xx but not auth or validation errors', () => {
    assert.equal(toOutcome(503, null).status, 'retry');
    assert.equal(toOutcome(400, null).status, 'failed');
    assert.equal(toOutcome(401, null).status, 'failed');
    assert.equal(toOutcome(403, null).status, 'failed');
  });
});

describe('Ka snapshot helpers', () => {
  it('extracts the project path from git remotes', () => {
    assert.equal(remotePath('https://oauth2:tok@git.example.org/softs/ka.git'), 'softs/ka');
    assert.equal(remotePath('git@github.com:me/claude-relay.git'), 'me/claude-relay');
    assert.equal(remotePath('https://git.example.org/a/b/c'), 'a/b/c');
  });

  it('flattens and keeps the tail of long questions within 200 chars', () => {
    assert.equal(shortQuestion('  Shall\n I  go? '), 'Shall I go?');
    const long = 'x'.repeat(300) + ' Continue?';
    const q = shortQuestion(long)!;
    assert.equal(q.length, 200);
    assert.ok(q.startsWith('…'));
    assert.ok(q.endsWith('Continue?'));
    assert.equal(shortQuestion('   '), undefined);
  });
});

function snap(sessionId: string, state: SessionSnapshot['state'], type?: string): SessionSnapshot {
  return { sessionId, project: 'softs/demo', state, type, tmuxPane: '%1' };
}

function harness(outcomes: KaSendOutcome[] = []) {
  let now = 0;
  let snapshots: SessionSnapshot[] = [];
  const sent: KaSessionUpdate[] = [];
  const publisher = new SessionStatePublisher({
    snapshot: () => snapshots,
    send: async update => {
      sent.push(update);
      return outcomes.shift() ?? { status: 'sent' };
    },
    log: () => {},
    now: () => now,
  });
  return {
    sent,
    set: (s: SessionSnapshot[]) => { snapshots = s; },
    at: async (t: number) => { now = t; await publisher.tick(); },
  };
}

describe('SessionStatePublisher', () => {
  it('sends a state only once it has been stable for 3s, and only once', async () => {
    const h = harness();
    h.set([snap('a', 'working')]);
    await h.at(0);
    await h.at(2000);
    assert.equal(h.sent.length, 0);
    await h.at(3000);
    await h.at(10_000);
    assert.equal(h.sent.length, 1);
    assert.equal(h.sent[0].state, 'working');
    assert.equal(h.sent[0].at, new Date(0).toISOString());
  });

  it('ignores a state that flaps back before becoming stable', async () => {
    const h = harness();
    h.set([snap('a', 'working')]);
    await h.at(0);
    await h.at(3000);
    h.set([snap('a', 'waiting_permission', 'permission_prompt')]);
    await h.at(4000);
    h.set([snap('a', 'working')]);
    await h.at(5000);
    await h.at(9000);
    assert.deepEqual(h.sent.map(u => u.state), ['working']);
  });

  it('reports a vanished session as ended, without question or type', async () => {
    const h = harness();
    h.set([snap('a', 'waiting_input', 'idle_prompt')]);
    await h.at(0);
    await h.at(3000);
    h.set([]);
    await h.at(4000);
    assert.deepEqual(h.sent.map(u => u.state), ['waiting_input', 'ended']);
    assert.equal(h.sent[1].type, undefined);
  });

  it('does not report ended for a session never announced', async () => {
    const h = harness();
    h.set([snap('a', 'working')]);
    await h.at(0);
    h.set([]);
    await h.at(1000);
    await h.at(5000);
    assert.equal(h.sent.length, 0);
  });

  it('retries a failed send exactly once', async () => {
    const h = harness([{ status: 'retry', afterMs: 10_000 }, { status: 'retry', afterMs: 10_000 }]);
    h.set([snap('a', 'idle')]);
    await h.at(0);
    await h.at(3000);
    await h.at(12_000);
    assert.equal(h.sent.length, 1);
    await h.at(13_000);
    assert.equal(h.sent.length, 2);
    await h.at(60_000);
    assert.equal(h.sent.length, 2);
  });

  it('drops a pending retry superseded by a newer transition', async () => {
    const h = harness([{ status: 'retry', afterMs: 10_000 }]);
    h.set([snap('a', 'idle')]);
    await h.at(0);
    await h.at(3000);
    h.set([snap('a', 'working')]);
    await h.at(4000);
    await h.at(7000);
    await h.at(20_000);
    assert.deepEqual(h.sent.map(u => u.state), ['idle', 'working']);
  });

  it('does not retry a rejected request', async () => {
    const h = harness([{ status: 'failed', reason: 'http-401' }]);
    h.set([snap('a', 'idle')]);
    await h.at(0);
    await h.at(3000);
    await h.at(60_000);
    assert.equal(h.sent.length, 1);
  });
});

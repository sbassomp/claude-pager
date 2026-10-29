import type { KaSendOutcome, KaSessionState, KaSessionUpdate } from './client.js';

/** What the daemon currently knows about one live session. */
export interface SessionSnapshot {
  sessionId: string;
  project: string;
  state: KaSessionState;
  type?: string;
  question?: string;
  tmuxPane?: string;
}

export interface PublisherDeps {
  snapshot: () => SessionSnapshot[];
  send: (update: KaSessionUpdate) => Promise<KaSendOutcome>;
  log: (...parts: string[]) => void;
  now?: () => number;
}

interface Candidate {
  key: string;
  since: number;
  snapshot: SessionSnapshot;
}

const STABLE_MS = 3000;
const RESYNC_MS = 10 * 60 * 1000;

function transitionKey(s: SessionSnapshot): string {
  return `${s.state}|${s.type ?? ''}`;
}

/**
 * Pushes session state transitions to Ka. A state is sent once it has stayed
 * unchanged for STABLE_MS, and only once per transition. A session that drops
 * out of the snapshot is reported `ended`. A failed send is retried at most
 * once — no queue — and a newer transition supersedes a pending retry.
 * Ka keeps state in memory only and loses it when redeployed, so the current
 * state of every live session is re-sent on daemon startup (nothing sent yet),
 * every RESYNC_MS, and right after a send succeeds following a failure. Ka
 * treats these re-sends idempotently.
 */
export class SessionStatePublisher {
  private readonly candidates = new Map<string, Candidate>();
  private readonly lastSent = new Map<string, { snapshot: SessionSnapshot; since: number }>();
  private readonly retries = new Map<string, { update: KaSessionUpdate; dueAt: number }>();
  private running = false;
  private lastResyncAt: number | undefined;
  private resyncRequested = false;
  private failing = false;

  constructor(private readonly deps: PublisherDeps) {}

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.publishTransitions();
    } finally {
      this.running = false;
    }
  }

  private now(): number {
    return this.deps.now ? this.deps.now() : Date.now();
  }

  private async publishTransitions(): Promise<void> {
    const now = this.now();
    let snapshots: SessionSnapshot[];
    try {
      snapshots = this.deps.snapshot();
    } catch (err) {
      this.deps.log('ka-snapshot-failed', String((err as Error).message).slice(0, 60));
      return;
    }

    const sends: Promise<void>[] = [];
    const live = new Set<string>();
    const sentThisTick = new Set<string>();
    this.lastResyncAt ??= now;

    for (const s of snapshots) {
      live.add(s.sessionId);
      const key = transitionKey(s);
      const candidate = this.candidates.get(s.sessionId);
      if (!candidate || candidate.key !== key) {
        this.candidates.set(s.sessionId, { key, since: now, snapshot: s });
        continue;
      }
      const sent = this.lastSent.get(s.sessionId);
      if (now - candidate.since >= STABLE_MS && (!sent || transitionKey(sent.snapshot) !== key)) {
        this.lastSent.set(s.sessionId, { snapshot: s, since: candidate.since });
        sentThisTick.add(s.sessionId);
        sends.push(this.send(this.toUpdate(s, candidate.since), false));
      }
    }

    for (const [sessionId, sent] of this.lastSent) {
      if (live.has(sessionId)) continue;
      this.lastSent.delete(sessionId);
      this.candidates.delete(sessionId);
      const ended: SessionSnapshot = { ...sent.snapshot, state: 'ended', type: undefined, question: undefined };
      sends.push(this.send(this.toUpdate(ended, now), false));
    }
    // Never-announced sessions that vanished: just forget them.
    for (const sessionId of this.candidates.keys()) {
      if (!live.has(sessionId)) this.candidates.delete(sessionId);
    }

    for (const [sessionId, retry] of this.retries) {
      if (retry.dueAt > now) continue;
      this.retries.delete(sessionId);
      sentThisTick.add(sessionId);
      sends.push(this.send(retry.update, true));
    }

    if (this.resyncRequested || now - this.lastResyncAt >= RESYNC_MS) {
      this.resyncRequested = false;
      this.lastResyncAt = now;
      for (const [sessionId, sent] of this.lastSent) {
        if (sentThisTick.has(sessionId)) continue;
        // Periodic anyway: a failed re-send is not worth a retry.
        sends.push(this.send(this.toUpdate(sent.snapshot, sent.since), true));
      }
    }

    await Promise.all(sends);
  }

  private toUpdate(s: SessionSnapshot, since: number): KaSessionUpdate {
    return {
      session_id: s.sessionId,
      project: s.project,
      state: s.state,
      type: s.type,
      question: s.question,
      tmux_pane: s.tmuxPane,
      at: new Date(since).toISOString(),
    };
  }

  private async send(update: KaSessionUpdate, isRetry: boolean): Promise<void> {
    // A newer transition supersedes any retry still waiting for this session.
    this.retries.delete(update.session_id);
    let outcome: KaSendOutcome;
    try {
      outcome = await this.deps.send(update);
    } catch (err) {
      outcome = { status: 'failed', reason: String((err as Error).message).slice(0, 60) };
    }
    if (outcome.status === 'sent') {
      this.deps.log('ka-sent', update.session_id, update.state);
      if (this.failing) {
        // Ka may have restarted while unreachable: resync on the next tick.
        this.failing = false;
        this.resyncRequested = true;
      }
      return;
    }
    this.failing = true;
    if (outcome.status === 'retry' && !isRetry) {
      this.retries.set(update.session_id, { update, dueAt: this.now() + outcome.afterMs });
      this.deps.log('ka-send-deferred', update.session_id, update.state, `retry-in=${outcome.afterMs}ms`);
      return;
    }
    const reason = outcome.status === 'failed' ? outcome.reason : 'retry-exhausted';
    this.deps.log('ka-send-failed', update.session_id, update.state, reason);
  }
}

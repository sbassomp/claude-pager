import type { PendingQuestion, RelayEvent } from '../types.js';

const pending = new Map<string, PendingQuestion>();
const resolved = new Map<string, number>(); // eventId → timestamp of resolution
const RESOLVED_TTL_MS = 5 * 60 * 1000; // keep resolved events for 5 minutes
let nextShortId = (Date.now() % 10000) + 1;
let insertionOrder = 0;

export function addPending(event: RelayEvent, channelMessageId?: string): string {
  const shortId = String(nextShortId++);
  pending.set(event.id, {
    event,
    notifiedAt: Date.now(),
    channelMessageId,
    shortId,
    order: insertionOrder++,
  });
  return shortId;
}

export function getPending(eventId: string): PendingQuestion | undefined {
  return pending.get(eventId);
}

export function removePending(eventId: string): void {
  pending.delete(eventId);
  resolved.set(eventId, Date.now());
  // Cleanup old resolved entries
  const now = Date.now();
  for (const [id, ts] of resolved) {
    if (now - ts > RESOLVED_TTL_MS) resolved.delete(id);
  }
}

export function isResolved(eventId: string): boolean {
  return resolved.has(eventId);
}


// Default 12 hours so overnight prompts survive until morning. Configurable
// via RelayConfig.pendingTtlSeconds — the daemon calls setPendingTtlMs() at
// startup with the configured value.
let pendingTtlMs = 12 * 60 * 60 * 1000;

export function setPendingTtlMs(ms: number): void {
  if (ms > 0) pendingTtlMs = ms;
}

export function getPendingTtlMs(): number {
  return pendingTtlMs;
}

export function listPending(): PendingQuestion[] {
  // Expire old questions
  const now = Date.now();
  for (const [id, q] of pending) {
    if (now - q.notifiedAt > pendingTtlMs) {
      pending.delete(id);
    }
  }
  return Array.from(pending.values());
}

export interface SessionPendingSelection {
  // Event ids that should be removed: either superseded by transcript activity
  // (answered in the terminal / web) or obsolete idle_prompts.
  staleIds: string[];
  // The single pending question to surface for the session, if any.
  display: PendingQuestion | undefined;
}

/**
 * Decide, for one session, which pending events are stale and which (if any)
 * to show — pure so it can be unit-tested without fs/tmux/transcript I/O.
 *
 * A pending event is stale once the transcript has an entry newer than the
 * notification: while a question is open the transcript's last entry sits at
 * (permission_prompt) or before (idle_prompt fires ~60s later) `notifiedAt`, so
 * any later entry means a reply landed — including replies typed directly in the
 * terminal, which the web never sees otherwise. ALL stale events are reported,
 * so a backlog drains in one pass. Among the survivors, only the most recent
 * idle_prompt is kept (older ones are superseded), and permission_prompt wins
 * over idle_prompt for display.
 */
export function selectSessionPending(
  sessionPending: PendingQuestion[],
  lastTimestamp: number,
  staleBufferMs = 2000,
): SessionPendingSelection {
  const staleIds: string[] = [];

  let live = sessionPending.filter(p => {
    if (lastTimestamp > p.notifiedAt + staleBufferMs) {
      staleIds.push(p.event.id);
      return false;
    }
    return true;
  });

  const idlePrompts = live
    .filter(p => p.event.type === 'idle_prompt')
    .sort((a, b) => a.order - b.order);
  if (idlePrompts.length > 1) {
    const keep = idlePrompts[idlePrompts.length - 1];
    for (const obsolete of idlePrompts) {
      if (obsolete !== keep) staleIds.push(obsolete.event.id);
    }
    live = live.filter(p => p.event.type !== 'idle_prompt' || p === keep);
  }

  // Surface the MOST RECENT survivor — the question Claude is actually waiting
  // on right now — so the user lands on the current question instead of the
  // head of an already-answered backlog. permission_prompt still wins over
  // idle_prompt (it is a hard block), but among each type the newest is shown.
  const byNewest = [...live].sort((a, b) => b.order - a.order);
  const display = byNewest.find(p => p.event.type === 'permission_prompt') || byNewest[0];
  return { staleIds, display };
}

export interface ResolvedResponse {
  question: PendingQuestion;
  response: string;
}

export function resolveResponse(rawText: string): ResolvedResponse | null {
  const all = listPending();
  if (all.length === 0) return null;

  const text = rawText.trim();

  // Try "#<id> response" format — id can be a shortId (number) or event UUID
  const prefixed = text.match(/^#?([\w-]+)\s+(.+)$/s);
  if (prefixed) {
    const id = prefixed[1];
    const response = prefixed[2].trim();
    // Match by shortId (ntfy) or event ID (telegram)
    const match = all.find(q => q.shortId === id || q.event.id === id);
    if (match) {
      return { question: match, response };
    }
  }

  // Single pending → any text goes to it
  if (all.length === 1) {
    return { question: all[0], response: text };
  }

  // Multiple pending: route "allow"/"deny"/"yes"/"no" to most recent permission_prompt
  const lower = text.toLowerCase();
  if (['allow', 'deny', 'yes', 'no', 'y', 'n'].includes(lower)) {
    const permissionQuestions = all
      .filter(q => q.event.type === 'permission_prompt')
      .sort((a, b) => b.order - a.order);

    if (permissionQuestions.length > 0) {
      return { question: permissionQuestions[0], response: text };
    }
  }

  // Fallback: route to most recent pending
  const mostRecent = all.sort((a, b) => b.order - a.order)[0];
  return { question: mostRecent, response: text };
}

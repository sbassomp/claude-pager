import type { PendingQuestion, RelayEvent } from '../types.js';

const pending = new Map<string, PendingQuestion>();
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
}

const PENDING_TTL_MS = 30 * 60 * 1000; // 30 minutes

export function listPending(): PendingQuestion[] {
  // Expire old questions
  const now = Date.now();
  for (const [id, q] of pending) {
    if (now - q.notifiedAt > PENDING_TTL_MS) {
      pending.delete(id);
    }
  }
  return Array.from(pending.values());
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

import type { EventType } from '../types.js';

const VALID_EVENT_TYPES: ReadonlySet<string> = new Set<EventType>([
  'permission_prompt',
  'idle_prompt',
]);

const SESSION_ID_RE = /^[\w-]+$/;

export function isValidEventType(type: string): type is EventType {
  return VALID_EVENT_TYPES.has(type);
}

export function isValidSessionId(id: string): boolean {
  return SESSION_ID_RE.test(id);
}

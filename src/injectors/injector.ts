import type { EventType, SessionInfo } from '../types.js';

export interface InputInjector {
  readonly name: string;

  resolve(session: SessionInfo): Promise<boolean>;

  sendResponse(session: SessionInfo, text: string, eventType: EventType): Promise<boolean>;
}

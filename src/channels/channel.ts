import type { RelayEvent } from '../types.js';

export interface NotificationResult {
  messageId?: string;
  success: boolean;
  error?: string;
}

export interface FreeMessage {
  text: string;
  sessionId?: string;
  replyCallback: (text: string) => Promise<void>;
}

export interface ChannelListeners {
  onResponse: (rawText: string) => void | Promise<void>;
  onFreeMessage?: (msg: FreeMessage) => void | Promise<void>;
}

export interface ChannelProvider {
  readonly name: string;

  send(event: RelayEvent, shortId: string): Promise<NotificationResult>;

  sendRaw?(text: string): Promise<void>;

  sendSessionPicker?(text: string, sessions: Array<{ id: string; label: string }>): Promise<number | undefined>;

  startListening(listeners: ChannelListeners): void;

  stopListening(): void;
}

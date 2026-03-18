import type { RelayEvent } from '../types.js';

export interface NotificationResult {
  messageId?: string;
  success: boolean;
  error?: string;
}

export interface ChannelProvider {
  readonly name: string;

  send(event: RelayEvent, shortId: string): Promise<NotificationResult>;

  startListening(onResponse: (rawText: string) => void | Promise<void>): void;

  stopListening(): void;
}

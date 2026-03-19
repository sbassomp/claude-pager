export interface RelayConfig {
  port: number;
  channel: ChannelConfig;
  injector: 'auto' | 'tmux' | 'xdotool' | 'applescript';
  dataDir: string;
}

export interface ChannelConfig {
  type: 'ntfy' | 'telegram';
  ntfy?: NtfyConfig;
  telegram?: TelegramConfig;
}

export interface NtfyConfig {
  server: string;
  topic: string;
  user?: string;
  password?: string;
  token?: string;
}

export interface TelegramConfig {
  botToken: string;
  chatId: number;
}

export type EventType = 'permission_prompt' | 'idle_prompt';

export interface RelayEvent {
  id: string;
  sessionId: string;
  type: EventType;
  message: string;
  toolName?: string;
  toolInput?: string;
  project: string;
  timestamp: number;
}

export interface SessionInfo {
  sessionId: string;
  pid: number;
  tty: string;
  cwd: string;
  windowId?: number;
  tmuxPane?: string;
  timestamp: number;
}

export interface PendingQuestion {
  event: RelayEvent;
  notifiedAt: number;
  channelMessageId?: string;
  shortId: string;
  order: number;
}

export interface UserResponse {
  eventId: string;
  response: string;
}

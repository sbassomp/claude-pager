export interface CIConfig {
  type: 'gitlab' | 'github';
  gitlab?: { url: string; token: string };
  github?: { token: string };
}

export interface RelayConfig {
  port: number;
  channel: ChannelConfig;
  injector: 'auto' | 'tmux' | 'xdotool' | 'applescript';
  dataDir: string;
  ci?: CIConfig;
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
  // Set to true to opt in to a public ntfy.sh topic without auth — anyone who
  // guesses the topic can publish and have text injected into your terminal.
  // Off by default to prevent accidental insecure setups.
  allowInsecure?: boolean;
}

export interface TelegramConfig {
  botToken: string;
  chatId: number;
  voiceLanguage?: string;
}

export type EventType = 'permission_prompt' | 'idle_prompt';

export interface RelayEvent {
  id: string;
  sessionId: string;
  type: EventType;
  message: string;
  toolName?: string;
  toolInput?: string;
  context?: string;
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
  vscodePort?: number;
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

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
  dashboard?: DashboardConfig;
}

export interface DashboardConfig {
  // Interface to bind on. Default '127.0.0.1' (localhost only).
  // Set to '0.0.0.0' (or a specific LAN address) to expose the dashboard
  // beyond the host. When non-loopback, basicAuth is required unless
  // allowInsecure is true.
  bind?: string;
  basicAuth?: { user: string; password: string };
  // Skip the auth-required check when binding to a non-loopback address.
  // Use only behind a trusted reverse proxy that handles auth itself.
  allowInsecure?: boolean;
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

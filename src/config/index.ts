import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { safeJsonParse } from '../utils/json.js';
import type { RelayConfig } from '../types.js';

const DATA_DIR = join(homedir(), '.claude-relay');
const CONFIG_FILE = join(DATA_DIR, 'config.json');

const DEFAULT_CONFIG: RelayConfig = {
  port: 17380,
  channel: {
    type: 'ntfy',
  },
  injector: 'auto',
  dataDir: DATA_DIR,
};

export function getDataDir(): string {
  return DATA_DIR;
}

export function ensureDataDir(): void {
  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(join(DATA_DIR, 'sessions'), { recursive: true });
}

export function loadConfig(): RelayConfig {
  ensureDataDir();
  if (!existsSync(CONFIG_FILE)) {
    return { ...DEFAULT_CONFIG };
  }
  const raw = readFileSync(CONFIG_FILE, 'utf-8');
  return { ...DEFAULT_CONFIG, ...safeJsonParse<Partial<RelayConfig>>(raw, {}) };
}

export function saveConfig(config: RelayConfig): void {
  ensureDataDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n');
}

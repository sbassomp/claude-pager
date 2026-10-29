import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface KaConfig {
  url: string;
  token: string;
}

const DEFAULT_KA_CONFIG_FILE = join(homedir(), '.config', 'ka', 'config');

/** Parse `key=value` lines (url=, token=). Blank lines and `#` comments are skipped. */
export function parseKaConfig(raw: string): KaConfig | null {
  const values = new Map<string, string>();
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    values.set(trimmed.slice(0, eq).trim(), trimmed.slice(eq + 1).trim());
  }
  const url = values.get('url');
  const token = values.get('token');
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ''), token };
}

/** Ka push is opt-in: no config file (or an incomplete one) disables it. */
export function loadKaConfig(file = DEFAULT_KA_CONFIG_FILE): KaConfig | null {
  if (!existsSync(file)) return null;
  try {
    return parseKaConfig(readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

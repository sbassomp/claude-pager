import { readFileSync, writeFileSync, readdirSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getDataDir, ensureDataDir } from '../config/index.js';
import type { SessionInfo } from '../types.js';

function sessionsDir(): string {
  return join(getDataDir(), 'sessions');
}

export function registerSession(info: SessionInfo): void {
  ensureDataDir();
  const file = join(sessionsDir(), `${info.sessionId}.json`);
  writeFileSync(file, JSON.stringify(info, null, 2) + '\n');
}

export function getSession(sessionId: string): SessionInfo | null {
  const file = join(sessionsDir(), `${sessionId}.json`);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf-8'));
}

export function listSessions(): SessionInfo[] {
  const dir = sessionsDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(join(dir, f), 'utf-8')));
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function cleanDeadSessions(): number {
  let cleaned = 0;
  const dir = sessionsDir();
  if (!existsSync(dir)) return 0;

  for (const file of readdirSync(dir).filter(f => f.endsWith('.json'))) {
    const path = join(dir, file);
    const info: SessionInfo = JSON.parse(readFileSync(path, 'utf-8'));
    if (!isProcessAlive(info.pid)) {
      unlinkSync(path);
      cleaned++;
    }
  }
  return cleaned;
}

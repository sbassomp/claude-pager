import { readFileSync, writeFileSync, readdirSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { getDataDir, ensureDataDir } from '../config/index.js';
import { safeJsonParse } from '../utils/json.js';
import { isValidSessionId } from '../utils/validation.js';
import type { SessionInfo } from '../types.js';

function sessionsDir(): string {
  return join(getDataDir(), 'sessions');
}

export function registerSession(info: SessionInfo): void {
  if (!isValidSessionId(info.sessionId)) {
    console.debug('[tracker] Rejected invalid sessionId:', info.sessionId);
    return;
  }
  ensureDataDir();
  const file = join(sessionsDir(), `${info.sessionId}.json`);
  writeFileSync(file, JSON.stringify(info, null, 2) + '\n');
}

export function getSession(sessionId: string): SessionInfo | null {
  if (!isValidSessionId(sessionId)) return null;
  const file = join(sessionsDir(), `${sessionId}.json`);
  if (!existsSync(file)) return null;
  return safeJsonParse<SessionInfo | null>(readFileSync(file, 'utf-8'), null);
}

export function listSessions(): SessionInfo[] {
  const dir = sessionsDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => safeJsonParse<SessionInfo | null>(readFileSync(join(dir, f), 'utf-8'), null))
    .filter((s): s is SessionInfo => s !== null);
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isTmuxPaneAlive(pane: string): boolean {
  try {
    execFileSync('tmux', ['has-session', '-t', pane], { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

function isSessionAlive(info: SessionInfo): boolean {
  // If we have a tmux pane, check that instead of the PID
  if (info.tmuxPane) {
    return isTmuxPaneAlive(info.tmuxPane);
  }
  return isProcessAlive(info.pid);
}

export function cleanDeadSessions(): number {
  let cleaned = 0;
  const dir = sessionsDir();
  if (!existsSync(dir)) return 0;

  for (const file of readdirSync(dir).filter(f => f.endsWith('.json'))) {
    const path = join(dir, file);
    const info = safeJsonParse<SessionInfo | null>(readFileSync(path, 'utf-8'), null);
    if (!info || !isSessionAlive(info)) {
      unlinkSync(path);
      cleaned++;
    }
  }
  return cleaned;
}

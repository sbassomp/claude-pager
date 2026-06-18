import { readFileSync, writeFileSync, readdirSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { uptime } from 'node:os';
import { getDataDir, ensureDataDir } from '../config/index.js';
import { safeJsonParse } from '../utils/json.js';
import { isValidSessionId } from '../utils/validation.js';
import { logDaemon } from '../utils/log.js';
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

export function removeSession(sessionId: string): boolean {
  if (!isValidSessionId(sessionId)) return false;
  const file = join(sessionsDir(), `${sessionId}.json`);
  if (!existsSync(file)) return false;
  try { unlinkSync(file); return true; } catch { return false; }
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

/**
 * Snapshot of all live tmux pane ids in a single call, or `null` when tmux
 * could not be reached (server busy, timeout, not running).
 *
 * Returning `null` is load-bearing: it lets the caller distinguish "tmux says
 * this pane is gone" (a definitive negative — safe to reap) from "tmux did not
 * answer" (transient — must NOT reap, or a momentary hiccup under load silently
 * deletes still-running sessions that never get re-registered).
 */
function liveTmuxPanes(): Set<string> | null {
  try {
    const out = execFileSync('tmux', ['list-panes', '-a', '-F', '#{pane_id}'], { timeout: 2000 })
      .toString()
      .trim();
    return new Set(out ? out.split('\n') : []);
  } catch {
    return null;
  }
}

export function isSessionAlive(info: SessionInfo, livePanes: Set<string> | null): boolean {
  // Sessions registered before the last system boot are always dead, even if
  // their tmuxPane id (e.g. %1) has been reassigned to an unrelated new pane.
  // This is a definitive check (uptime-based), independent of tmux.
  const bootTime = Date.now() - uptime() * 1000;
  if (info.timestamp && info.timestamp < bootTime) return false;

  if (info.tmuxPane) {
    // Only reap on a definitive negative: tmux answered AND the pane is absent.
    // If tmux was unreachable (livePanes === null), assume the session is still
    // alive — never delete a live session because of a transient tmux failure.
    if (livePanes === null) return true;
    return livePanes.has(info.tmuxPane);
  }
  return isProcessAlive(info.pid);
}

export function cleanDeadSessions(): number {
  let cleaned = 0;
  const dir = sessionsDir();
  if (!existsSync(dir)) return 0;

  // One cheap tmux call for the whole sweep instead of one blocking probe per
  // session. If it fails, tmux-backed sessions are left untouched (see
  // isSessionAlive / liveTmuxPanes).
  const livePanes = liveTmuxPanes();

  for (const file of readdirSync(dir).filter(f => f.endsWith('.json'))) {
    const path = join(dir, file);
    const info = safeJsonParse<SessionInfo | null>(readFileSync(path, 'utf-8'), null);
    if (!info) {
      unlinkSync(path);
      cleaned++;
      continue;
    }
    if (!isSessionAlive(info, livePanes)) {
      unlinkSync(path);
      cleaned++;
      logDaemon('session-reaped', info.sessionId, info.tmuxPane || `pid:${info.pid}`);
    }
  }
  return cleaned;
}

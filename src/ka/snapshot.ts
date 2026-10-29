import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';
import { cleanDeadSessions, listSessions } from '../sessions/tracker.js';
import { isSessionInjectable } from '../sessions/helpers.js';
import { listPending, reapStalePending, selectSessionPending } from '../sessions/events.js';
import { deriveSessionState } from '../sessions/state.js';
import { readTranscriptInfo } from '../dashboard/transcript.js';
import type { SessionSnapshot } from './publisher.js';

const QUESTION_MAX = 200;
const projectCache = new Map<string, string>();

/**
 * Project as Ka names it: the git remote path (`softs/ka`), falling back to the
 * directory name. Cached per cwd — remotes do not move under a live session.
 */
export function projectName(cwd: string): string {
  const cached = projectCache.get(cwd);
  if (cached) return cached;
  let name = basename(cwd) || cwd;
  try {
    const url = execFileSync('git', ['-C', cwd, 'remote', 'get-url', 'origin'], {
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim();
    const path = remotePath(url);
    if (path) name = path;
  } catch {
    // not a git repo or no origin — keep the directory name
  }
  projectCache.set(cwd, name);
  return name;
}

/** https://user:tok@host/group/repo.git, git@host:group/repo.git → group/repo */
export function remotePath(url: string): string | null {
  const match = url.match(/^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?[^/:]+[:/](.+?)(?:\.git)?\/?$/i);
  return match ? match[1] : null;
}

/**
 * Human-readable message only, never tool input. The question Claude asks sits
 * at the end of an idle_prompt text, so long texts keep their tail.
 */
export function shortQuestion(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const flat = text.replace(/\s+/g, ' ').trim();
  if (!flat) return undefined;
  return flat.length > QUESTION_MAX ? '…' + flat.slice(-(QUESTION_MAX - 1)) : flat;
}

/** Same view as the dashboard: live, injectable sessions with a known state. */
export function collectSessionSnapshots(): SessionSnapshot[] {
  cleanDeadSessions();
  reapStalePending((sessionId, cwd) => readTranscriptInfo(sessionId, cwd).lastTimestamp);
  const pending = listPending();

  const snapshots: SessionSnapshot[] = [];
  for (const session of listSessions().filter(isSessionInjectable)) {
    const transcript = readTranscriptInfo(session.sessionId, session.cwd);
    const { display } = selectSessionPending(
      pending.filter(p => p.event.sessionId === session.sessionId),
      transcript.lastTimestamp,
    );
    const state = deriveSessionState(transcript.state, display);
    if (state === 'unknown') continue;

    const waiting = state === 'waiting_input' || state === 'waiting_permission';
    const message = display?.event.type === 'idle_prompt'
      ? transcript.lastAssistantText || display.event.message
      : display?.event.message || transcript.lastAssistantText;
    snapshots.push({
      sessionId: session.sessionId,
      project: projectName(session.cwd),
      state,
      type: display?.event.type,
      question: waiting ? shortQuestion(message) : undefined,
      tmuxPane: session.tmuxPane,
    });
  }
  return snapshots;
}

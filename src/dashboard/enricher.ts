import { listSessions, cleanDeadSessions } from '../sessions/tracker.js';
import { listPending } from '../sessions/events.js';
import { readTranscriptInfo } from './transcript.js';
import { getGitStatus } from './git-status.js';
import type { GitInfo } from './git-status.js';

export interface DashboardSession {
  sessionId: string;
  title: string;
  state: 'working' | 'waiting_input' | 'waiting_permission' | 'idle' | 'unknown';
  pendingQuestion?: {
    shortId: string;
    type: string;
    message: string;
    toolName?: string;
    agoSeconds: number;
  };
  git: GitInfo;
  needsTesting: boolean;
  committed: boolean;
  pushed: boolean;
  tmuxPane: string;
  lastActivity: number;
}

export interface DashboardProject {
  name: string;
  path: string;
  sessions: DashboardSession[];
}

export interface DashboardResponse {
  projects: DashboardProject[];
  updatedAt: number;
}

export function getDashboardData(): DashboardResponse {
  cleanDeadSessions();
  const sessions = listSessions();
  const pending = listPending();

  const enriched: Array<DashboardSession & { cwd: string }> = sessions
    .filter(s => s.tmuxPane)
    .map(session => {
      const transcript = readTranscriptInfo(session.sessionId, session.cwd);
      const git = getGitStatus(session.cwd);
      const pendingQ = pending.find(p => p.event.sessionId === session.sessionId);

      // State: pending question overrides transcript state
      let state: DashboardSession['state'] = transcript.state;
      if (pendingQ) {
        state = pendingQ.event.type === 'permission_prompt'
          ? 'waiting_permission'
          : 'waiting_input';
      }

      return {
        sessionId: session.sessionId,
        title: transcript.title,
        state,
        pendingQuestion: pendingQ ? {
          shortId: pendingQ.shortId,
          type: pendingQ.event.type,
          message: pendingQ.event.message.slice(0, 200),
          toolName: pendingQ.event.toolName,
          agoSeconds: Math.floor((Date.now() - pendingQ.notifiedAt) / 1000),
        } : undefined,
        git,
        needsTesting: git.modifiedFiles > 0 || git.unpushedCommits > 0,
        committed: git.modifiedFiles === 0 || transcript.recentCommit,
        pushed: git.unpushedCommits === 0 || transcript.recentPush,
        tmuxPane: session.tmuxPane || '',
        lastActivity: transcript.lastTimestamp || session.timestamp,
        cwd: session.cwd,
      };
    });

  // Group by project (cwd)
  const projectMap = new Map<string, Array<DashboardSession & { cwd: string }>>();
  for (const s of enriched) {
    const existing = projectMap.get(s.cwd) || [];
    existing.push(s);
    projectMap.set(s.cwd, existing);
  }

  const stateOrder: Record<string, number> = {
    waiting_permission: 0,
    waiting_input: 1,
    working: 2,
    idle: 3,
    unknown: 4,
  };

  const projects: DashboardProject[] = Array.from(projectMap.entries())
    .map(([path, sessions]) => ({
      name: path.split('/').pop() || path,
      path,
      sessions: sessions
        .map(({ cwd: _cwd, ...rest }) => rest)
        .sort((a, b) => (stateOrder[a.state] ?? 5) - (stateOrder[b.state] ?? 5)),
    }))
    // Sort projects: those with active/waiting sessions first
    .sort((a, b) => {
      const aMin = Math.min(...a.sessions.map(s => stateOrder[s.state] ?? 5));
      const bMin = Math.min(...b.sessions.map(s => stateOrder[s.state] ?? 5));
      return aMin !== bMin ? aMin - bMin : a.name.localeCompare(b.name);
    });

  return { projects, updatedAt: Date.now() };
}

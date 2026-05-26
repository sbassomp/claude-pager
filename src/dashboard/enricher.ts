import { execFileSync } from 'node:child_process';
import { listSessions, cleanDeadSessions } from '../sessions/tracker.js';
import { isSessionInjectable } from '../sessions/helpers.js';
import { listPending, removePending } from '../sessions/events.js';
import { listNotes } from '../notes/store.js';
import { loadConfig } from '../config/index.js';
import { readTranscriptInfo } from './transcript.js';
import { getGitStatus } from './git-status.js';
import { getCIPipelines } from './ci-provider.js';
import type { GitInfo } from './git-status.js';
import type { BranchPipelines } from './ci-provider.js';
import type { Note } from '../notes/store.js';

// Track last title set per pane to avoid unnecessary tmux calls
const lastPaneTitle = new Map<string, string>();

function updatePaneTitle(tmuxPane: string, title: string): void {
  // Truncate to 30 chars for tab readability
  const short = title.length > 30 ? title.slice(0, 28) + '..' : title;
  if (lastPaneTitle.get(tmuxPane) === short) return;

  try {
    execFileSync('tmux', ['rename-window', '-t', tmuxPane, short], { timeout: 1000 });
    lastPaneTitle.set(tmuxPane, short);
  } catch {
    // tmux not available or pane not found
  }
}

export interface DashboardSession {
  sessionId: string;
  title: string;
  state: 'working' | 'waiting_input' | 'waiting_permission' | 'idle' | 'unknown';
  pendingQuestion?: {
    eventId: string;
    shortId: string;
    type: string;
    message: string;
    toolName?: string;
    toolInput?: string;
    context?: string;
    agoSeconds: number;
  };
  // Last assistant text from the transcript, surfaced in the card body when
  // there is no pending event so the user can see Claude's most recent answer
  // (and any question at the end of it) before Claude Code fires its 60s
  // idle_prompt notification — or after the previous notification has been
  // resolved. Omitted while Claude is actively working.
  lastAssistantText?: string;
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
  notes: Note[];
  ci?: BranchPipelines;
}

export interface DashboardResponse {
  projects: DashboardProject[];
  updatedAt: number;
  terminalEnabled: boolean;
}

export async function getDashboardData(): Promise<DashboardResponse> {
  cleanDeadSessions();
  const sessions = listSessions();
  const pending = listPending();
  const config = loadConfig();

  const DAY_MS = 24 * 3600_000;

  const enriched = (await Promise.all(
    sessions
      .filter(s => isSessionInjectable(s))
      .map(async (session): Promise<DashboardSession & { cwd: string }> => {
        const transcript = readTranscriptInfo(session.sessionId, session.cwd);
        const git = await getGitStatus(session.cwd);
        // Find pending question for this session — prioritize permission_prompt over idle_prompt
        const sessionPending = pending.filter(p => p.event.sessionId === session.sessionId);
        let pendingQ: (typeof sessionPending)[number] | undefined =
          sessionPending.find(p => p.event.type === 'permission_prompt')
          || sessionPending[0];

        // Auto-clear stale pending questions that were answered directly in the terminal
        if (pendingQ) {
          const isStale =
            // Permission prompt: if transcript progressed after notification, it was answered
            (pendingQ.event.type === 'permission_prompt' && transcript.lastTimestamp > pendingQ.notifiedAt + 2000) ||
            // Idle prompt: if Claude is now working again, user already replied
            (pendingQ.event.type === 'idle_prompt' && transcript.state === 'working' && transcript.lastTimestamp > pendingQ.notifiedAt);

          if (isStale) {
            removePending(pendingQ.event.id);
            pendingQ = undefined;
          }
        }

        // State: pending question overrides transcript state
        let state: DashboardSession['state'] = transcript.state;
        if (pendingQ) {
          state = pendingQ.event.type === 'permission_prompt'
            ? 'waiting_permission'
            : 'waiting_input';
        }

        // Update tmux pane title with the session title
        if (session.tmuxPane && transcript.title && transcript.title !== 'No transcript') {
          const projectName = session.cwd.split('/').pop() || '';
          updatePaneTitle(session.tmuxPane, `${projectName}: ${transcript.title}`);
        }

        return {
          sessionId: session.sessionId,
          title: transcript.title,
          state,
          pendingQuestion: pendingQ ? (() => {
            // For idle_prompts the event message was frozen at notification
            // time. Claude often keeps adding text after that, so prefer the
            // freshly-extracted last assistant text from the transcript when
            // available. The question Claude asks is always at the *end*
            // of an idle_prompt, so slice from the end on overflow rather
            // than from the start.
            const isIdle = pendingQ.event.type === 'idle_prompt';
            const raw = (isIdle && transcript.lastAssistantText)
              ? transcript.lastAssistantText
              : pendingQ.event.message;
            const message = raw.length > 3000
              ? (isIdle ? raw.slice(-3000) : raw.slice(0, 3000))
              : raw;
            return {
              eventId: pendingQ.event.id,
              shortId: pendingQ.shortId,
              type: pendingQ.event.type,
              message,
              toolName: pendingQ.event.toolName,
              toolInput: pendingQ.event.toolInput,
              context: pendingQ.event.context,
              agoSeconds: Math.floor((Date.now() - pendingQ.notifiedAt) / 1000),
            };
          })() : undefined,
          // Surface the latest assistant text when the session is not
          // actively working AND there is no pending event to render. This
          // covers the gap between Claude finishing a turn and Claude Code
          // firing its idle_prompt notification 60s later.
          lastAssistantText: (
            !pendingQ
            && state !== 'working'
            && transcript.lastAssistantText
          ) ? transcript.lastAssistantText.slice(-3000) : undefined,
          git,
          needsTesting: false, // computed at project level after CI fetch
          committed: git.modifiedFiles === 0 || transcript.recentCommit,
          pushed: git.unpushedCommits === 0 || transcript.recentPush,
          tmuxPane: session.tmuxPane || '',
          lastActivity: transcript.lastTimestamp || session.timestamp,
          cwd: session.cwd,
        };
      }),
  ))
    // Filter out sessions with no transcript that are older than 24h (stale recovered sessions)
    .filter(s => !(s.title === 'No transcript' && Date.now() - s.lastActivity > DAY_MS));

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

  // Fetch CI pipelines for each unique cwd (in parallel)
  const uniqueCwds = Array.from(projectMap.keys());
  const ciResults = new Map<string, BranchPipelines>();
  if (config.ci) {
    const ciPromises = uniqueCwds.map(async (cwd) => {
      const pipelines = await getCIPipelines(cwd, config.ci);
      ciResults.set(cwd, pipelines);
    });
    await Promise.all(ciPromises);
  }

  const projects: DashboardProject[] = Array.from(projectMap.entries())
    .map(([path, sessions]) => {
      const ci = ciResults.get(path);
      const git = sessions[0]?.git;

      // needsTesting logic:
      // - CI failed on any branch → needs testing
      // - Has unpushed commits (CI hasn't seen this code yet) → needs testing
      // - No CI configured but has uncommitted changes → needs testing (fallback)
      const ciFailed = ci?.main?.status === 'failed' || ci?.staging?.status === 'failed';
      const ciRunning = ci?.main?.status === 'running' || ci?.staging?.status === 'running';
      const hasUnpushed = git ? git.unpushedCommits > 0 : false;
      const hasCI = !!(ci?.main || ci?.staging);
      const needsTesting = ciFailed || hasUnpushed || (!hasCI && git ? git.modifiedFiles > 0 : false);

      const projectName = path.split('/').pop() || path;
      return {
        name: projectName,
        path,
        sessions: sessions
          .map(({ cwd: _cwd, ...rest }) => ({ ...rest, needsTesting }))
          .sort((a, b) => (stateOrder[a.state] ?? 5) - (stateOrder[b.state] ?? 5)),
        notes: listNotes(projectName),
        ci,
        ciRunning,
      };
    })
    .sort((a, b) => {
      const aMin = Math.min(...a.sessions.map(s => stateOrder[s.state] ?? 5));
      const bMin = Math.min(...b.sessions.map(s => stateOrder[s.state] ?? 5));
      return aMin !== bMin ? aMin - bMin : a.name.localeCompare(b.name);
    });

  return { projects, updatedAt: Date.now(), terminalEnabled: config.dashboard?.allowTerminal === true };
}

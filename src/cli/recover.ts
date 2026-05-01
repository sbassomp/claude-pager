import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { registerSession, listSessions, removeSession } from '../sessions/tracker.js';
import { ensureDataDir } from '../config/index.js';

function projectDir(cwd: string): string {
  return join(homedir(), '.claude', 'projects', cwd.replace(/\//g, '-'));
}

function listTranscriptsByMtime(cwd: string): Array<{ uuid: string; mtime: number }> {
  try {
    const dir = projectDir(cwd);
    return readdirSync(dir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => ({ uuid: f.replace(/\.jsonl$/, ''), mtime: statSync(join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
  } catch {
    return [];
  }
}

export function recover(): void {
  ensureDataDir();

  let panes: Array<{ paneId: string; command: string; cwd: string }>;
  try {
    const out = execFileSync('tmux', [
      'list-panes', '-a', '-F', '#{pane_id}\t#{pane_current_command}\t#{pane_current_path}',
    ], { timeout: 5000 }).toString();

    panes = out.trim().split('\n').filter(Boolean).map(line => {
      const [paneId, command, cwd] = line.split('\t');
      return { paneId, command, cwd };
    });
  } catch {
    console.log('No tmux sessions found.');
    return;
  }

  const claudePanes = panes.filter(p => p.command === 'claude');
  if (claudePanes.length === 0) {
    console.log('No Claude Code sessions found in tmux.');
    return;
  }

  // Drop placeholders from a previous recover so the same panes don't appear twice.
  // Real-UUID sessions stay — they may be live and registered through hooks.
  for (const s of listSessions()) {
    if (s.sessionId.startsWith('recovered-')) {
      removeSession(s.sessionId);
    }
  }

  // Map each pane to the most-recently-modified unclaimed transcript in its cwd.
  // Heuristic: when several Claudes share a cwd, panes are matched to transcripts
  // by mtime order — we have no reliable pane→transcript link from tmux alone.
  const claimedByCwd = new Map<string, Set<string>>();

  let matched = 0;
  let placeholders = 0;
  for (const pane of claudePanes) {
    const transcripts = listTranscriptsByMtime(pane.cwd);
    const claimed = claimedByCwd.get(pane.cwd) ?? new Set<string>();
    const match = transcripts.find(t => !claimed.has(t.uuid));

    let sessionId: string;
    if (match) {
      sessionId = match.uuid;
      claimed.add(match.uuid);
      claimedByCwd.set(pane.cwd, claimed);
      matched++;
    } else {
      sessionId = `recovered-${pane.paneId.replace('%', '')}`;
      placeholders++;
    }

    registerSession({
      sessionId,
      pid: 0,
      tty: '',
      cwd: pane.cwd,
      tmuxPane: pane.paneId,
      timestamp: Date.now(),
    });

    const project = pane.cwd.split('/').pop();
    const tag = match ? 'matched transcript' : 'no transcript found';
    console.log(`  ${pane.paneId} → ${project} (${sessionId}) — ${tag}`);
  }

  console.log(`\nRecovered ${claudePanes.length} session(s): ${matched} matched, ${placeholders} placeholder.`);
}

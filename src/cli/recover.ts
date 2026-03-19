import { execFileSync } from 'node:child_process';
import { registerSession } from '../sessions/tracker.js';
import { ensureDataDir } from '../config/index.js';
import { randomUUID } from 'node:crypto';

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

  let created = 0;
  for (const pane of claudePanes) {
    const sessionId = `recovered-${pane.paneId.replace('%', '')}`;
    registerSession({
      sessionId,
      pid: 0,
      tty: '',
      cwd: pane.cwd,
      tmuxPane: pane.paneId,
      timestamp: Date.now(),
    });
    const project = pane.cwd.split('/').pop();
    console.log(`  ${pane.paneId} → ${project} (${sessionId})`);
    created++;
  }

  console.log(`\nRecovered ${created} session(s).`);
}

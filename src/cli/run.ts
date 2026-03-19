import { execFileSync, execSync } from 'node:child_process';
import { basename } from 'node:path';

export function run(args: string[]): void {
  // Generate a session name from cwd
  const project = basename(process.cwd());
  const sessionName = `claude-${project}-${process.pid}`;

  // Build the claude command with any extra args
  const claudeArgs = args.length > 0 ? args.join(' ') : '';
  const claudeCmd = claudeArgs ? `claude ${claudeArgs}` : 'claude';

  // Check if we're already inside tmux
  if (process.env.TMUX) {
    // Already in tmux — just run claude directly
    console.log(`Already in tmux (pane ${process.env.TMUX_PANE}), launching Claude Code...`);
    execSync(claudeCmd, { stdio: 'inherit' });
    return;
  }

  console.log(`Launching Claude Code in tmux session "${sessionName}"...`);

  try {
    // Create a new tmux session and run claude inside it, then attach
    execFileSync('tmux', [
      'new-session',
      '-s', sessionName,
      claudeCmd,
    ], { stdio: 'inherit' });
  } catch {
    // tmux returns non-zero when the session ends normally
  }
}

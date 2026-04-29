import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';

export function run(args: string[]): void {
  // Generate a session name from cwd
  const project = basename(process.cwd());
  const sessionName = `claude-${project}-${process.pid}`;

  // Build the claude args array (safe from injection)
  const claudeArgs = ['claude', ...args];

  // Check if we're already inside tmux
  if (process.env.TMUX) {
    // Already in tmux — just run claude directly
    console.log(`Already in tmux (pane ${process.env.TMUX_PANE}), launching Claude Code...`);
    execFileSync('claude', args, { stdio: 'inherit' });
    return;
  }

  // Ensure tmux propagates window titles to the terminal (Kitty, etc.)
  // and that mouse-wheel scrolls the scrollback instead of cycling shell history.
  try {
    execFileSync('tmux', ['set-option', '-g', 'set-titles', 'on'], { timeout: 1000 });
    execFileSync('tmux', ['set-option', '-g', 'set-titles-string', '#W'], { timeout: 1000 });
    execFileSync('tmux', ['set-option', '-g', 'mouse', 'on'], { timeout: 1000 });
    // Wheel up: enter copy-mode and scroll for plain shells; pass through for
    // alternate-screen TUIs (Claude Code, vim, less…) so they handle the wheel.
    execFileSync('tmux', [
      'bind-key', '-n', 'WheelUpPane',
      'if-shell', '-F', '-t', '=',
      '#{?pane_in_mode,1,#{alternate_on}}',
      'send-keys -M',
      'select-pane -t =; copy-mode -e; send-keys -M',
    ], { timeout: 1000 });
    execFileSync('tmux', [
      'bind-key', '-n', 'WheelDownPane',
      'select-pane -t = ; send-keys -M',
    ], { timeout: 1000 });
  } catch {
    // tmux not running yet — options will be set after session creation
  }

  console.log(`Launching Claude Code in tmux session "${sessionName}"...`);

  try {
    // Create a new tmux session and run claude inside it, then attach
    execFileSync('tmux', [
      'new-session',
      '-s', sessionName,
      ...claudeArgs,
    ], { stdio: 'inherit' });
  } catch {
    // tmux returns non-zero when the session ends normally
  }
}

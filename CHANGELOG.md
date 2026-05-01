# Changelog

## 0.3.5 (2026-05-02)

### Fixes

- **Stale sessions persist across reboots** — after a system reboot, dashboard cards from previous sessions remained because `isSessionAlive` only checked that a tmux pane with the recorded id (`%0`, `%1`, …) still existed. tmux reassigns those ids to new panes, so old sessions appeared "alive" pointing at unrelated panes (e.g. a `figma-audit` session showing on a pane that now hosts something else). Sessions registered before the last system boot are now treated as dead regardless of their tmux pane id.

## 0.3.4 (2026-04-30)

### Fixes

- **tmux injector available in auto mode on all platforms** — previously the `auto` chain on macOS/Windows was VS Code only, so users without a reachable VS Code extension hit "Failed to inject message" with no fallback even when tmux was available. The composite now tries `[vscode, tmux]` regardless of platform; `TmuxInjector.resolve()` returns false cleanly when tmux is absent.
- **Setup detects tmux** — new "Input injection" step in `claude-pager setup` detects tmux via `tmux -V` and prompts for the injector mode (auto / tmux / xdotool on Linux). Choice persisted in `config.injector`.
- **Daemon shutdown hangs when SSE clients are connected** — the `/api/v1/sse` route hijacks the response and disables timeouts, so open SSE connections never drained on their own and `app.close()` waited forever on SIGTERM/SIGINT. Shutdown handler now closes SSE clients first, races `app.close()` against a 3s safety timeout, and is idempotent against repeat Ctrl+C.
- **tmux mouse wheel scrolls scrollback** — in a tmux pane running a plain shell, the wheel was sending arrow up/down to the shell, navigating command history rather than scrolling. Mouse mode is now activated and `WheelUpPane` / `WheelDownPane` enter copy-mode for plain shells while passing events through for alternate-screen TUIs (Claude Code, vim, less, etc.).

## 0.3.3 (2026-04-29)

### Fixes

- **Redirect `/` to `/dashboard`** — root URL no longer returns 404
- **Larger diff in Telegram permission prompts** — Edit prompts truncated diffs at 300 chars total, hiding the entire `+++ new` side. Hook now captures up to 1000 chars per side and Telegram displays up to 3000 chars (well below the 4096-char Telegram message limit)

## 0.3.2 (2026-04-29)

### Cross-platform fixes

- **macOS support** — `claude-pager start` no longer crashes on darwin. The injector factory now falls back to a VS Code-only composite on non-Linux platforms (introduced in 0.3.1's commit but not shipped).
- **Hook xdotool guard** — skip `xdotool getactivewindow` on non-Linux platforms instead of relying on a silent catch.
- **Voice transcription** — use `python3` instead of hardcoded `python3.10` for compatibility with macOS Homebrew installs.
- **README** — document macOS prerequisites (`brew install tmux`).

## 0.3.1 (2026-04-01)

### Project Notes

- **Per-project note backlog** — capture ideas and tasks while the agent is working, send them when it's idle
- **3 input channels**: dashboard (text + paste image), Telegram ("Note pour X: ..."), CLI (`claude-pager note`)
- **Image support** — paste screenshots directly into the note input, stored as thumbnails with lightbox viewer
- **Drag & reorder** notes, inline edit text, move up/down buttons
- **Send to session** — click ▶ to inject note text into the most recent idle session, with visual feedback (card flash + sent banner)
- **CLI commands**: `claude-pager note <project> <text>` and `claude-pager notes [project]`

### Dashboard Improvements

- **SSE push** — Server-Sent Events for instant dashboard updates, polling as 10s fallback
- **Diff in permission prompts** — Edit tool requests now show old/new content with red/green coloring
- **Notes panel inline** with session cards in the grid layout
- **Colored age indicator** — clock icon turns green → yellow → orange → red based on note age
- **Fix Enter key** on reply inputs — skip DOM re-render when an input is focused

### Performance

- **Async git status** — `execFile` instead of `execFileSync`, no longer blocks the event loop

### Security

- Fix XSS in image lightbox (createElement instead of innerHTML)
- Image uploads capped at 5 MB
- Strict UUID regex for image filename serving
- Input length limits on note text (10 KB) and project names (255 chars)
- Atomic file persistence (write tmp + rename)
- Image files cleaned up when notes are deleted

## 0.2.2 (2026-03-31)

### Dashboard Improvements

- **Send messages to idle sessions** directly from the dashboard — no need to wait for idle_prompt
- **Expandable titles** — long messages truncated to 2 lines with "..." button to expand
- **Expanded titles survive refresh** — expanded state is preserved across 2-second auto-refresh cycles
- **Dismiss button** (🗑) to remove stale sessions manually
- **tmux tab titles** auto-update with the current session topic (works with Kitty, iTerm2, etc.)
- Auto-enable tmux `set-titles` on `claude-pager run`
- Skip DOM refresh while user is typing in an input field
- Dashboard refresh rate increased to 2 seconds

### Performance

- **Telegram notifications sent in background** — hook response is immediate, no longer blocked by Telegram API latency

### Bug Fixes

- **Fix session state detection** — sessions where Claude asked a question (text-only assistant message) now correctly show as "Waiting" instead of "Working"
- **Fix timestamp mismatch** — state age is now computed from the entry's own timestamp, not from a potentially unrelated newer entry
- **Fix missing input for waiting sessions** — "Send a message" field now appears for sessions detected as waiting from transcript (not just idle)
- Better stale pending detection — check transcript state and progression
- Human-readable time for pending age (e.g., "6m ago" instead of "378s ago")

## 0.2.0 (2026-03-31)

### Web Dashboard

- **Live dashboard** at `http://127.0.0.1:17380/dashboard` with 2-second auto-refresh
- Sessions grouped by project with state badges (Working, Waiting, Permission, Idle)
- **Allow/Deny buttons** directly in the dashboard — no need to switch to Telegram
- **Allow All** button in header when multiple permissions are pending
- **Text input** for idle prompts — type a reply and press Enter
- **CI/CD pipeline status** per project (main + staging branches) with clickable links to pipeline
- **Git status** per session: branch, modified files, unpushed commits
- **Commit/push detection** from Claude's transcript messages (green/yellow flags)
- **"Needs Testing" indicator** based on CI status: failed pipeline or unpushed commits
- **Pin projects** to lock their position in the dashboard (saved in browser localStorage)
- **Title extraction** from recent Claude activity (last tool_use or assistant message)
- Stale sessions (idle >2h) dimmed with dashed border
- Mobile responsive layout
- Dark terminal theme with JetBrains Mono font

### CI/CD Integration

- **GitLab CI provider**: fetch pipeline status per branch via GitLab API
- **GitHub Actions provider**: ready for use with personal access token
- **Setup wizard**: `claude-pager setup` now asks for CI/CD configuration
- Automatic project ID resolution via GitLab search API
- 30-second cache on CI API calls

### Notification Improvements

- **Subagent support**: tool context extraction now searches subagent transcripts when not found in main transcript
- **Transcript search window** increased from 10 to 30 lines for reliable tool context extraction
- **Expired event detection**: late Telegram responses to already-resolved events are silently discarded instead of being injected as free text
- **Resolved event tracking**: events are tracked for 5 minutes after resolution to prevent duplicate injections
- **Pending TTL** increased from 5 to 30 minutes for mobile response time
- **Pending auto-cleanup**: questions answered directly in the terminal are automatically cleared from the dashboard
- **Permission priority**: permission_prompt always takes precedence over idle_prompt in the dashboard

### Bug Fixes

- Fix stale `#uuid allow` responses being injected as raw text into wrong terminal
- Fix dashboard showing text input instead of Allow/Deny for permission prompts
- Hide git flags (committed/pushed) when project has no git repository
- Hide stale recovered sessions with no transcript (older than 24h)
- Human-readable time display for pending question age (e.g., "6m ago" instead of "378s ago")

## 0.1.7 (2026-03-25)

- Fix: extract tool context from subagent transcripts
- Fix: increase transcript search window to 30 lines

## 0.1.6 (2026-03-22)

- Fix: prevent expired event responses from being injected as free text
- Increase pending TTL from 5 to 30 minutes

## 0.1.5 (2026-03-22)

- Improved demo video with music, tighter crops, redacted PII
- YouTube demo link in README

## 0.1.4 (2026-03-22)

- Updated README with demo screenshots and YouTube video link

## 0.1.3 (2026-03-21)

- Screenshots and demo video in README

## 0.1.2 (2026-03-20)

- Fixed inaccurate security claim about notification content in README

## 0.1.1 (2026-03-20)

- Fixed expired event responses being injected as free text
- Increased pending TTL from 5 to 30 minutes

## 0.1.0 (2026-03-19)

- Initial release
- Telegram channel with inline keyboards (Allow/Deny), reply routing, voice transcription (Whisper)
- ntfy channel with push notifications
- tmux injector (send-keys to correct pane)
- xdotool injector (X11 window injection)
- Multi-session support with smart routing
- Session recovery from existing tmux panes
- Fallback by project directory when session UUID not found
- ESLint with typescript-eslint, 44 tests
- Fastify JSON Schema validation on all endpoints
- Security: execFileSync, safeJsonParse, memory-bounded maps

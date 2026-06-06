# Changelog

## 0.3.21 (2026-05-26)

### Features

- **Pending event TTL bumped to 12 h and made configurable** — pending permission/idle prompts used to expire after 30 minutes, so anything fired overnight was gone by morning. Default TTL is now **12 hours**, and the new `pendingTtlSeconds` config option lets you tune it (e.g. `86400` for 24 h, or `3600` for a stricter 1 h window). Applied at daemon startup via `setPendingTtlMs(config.pendingTtlSeconds * 1000)`; in-memory store accepts only positive values.

## 0.3.20 (2026-05-11)

### Features

- **Live terminal view from the dashboard (opt-in)** — a 📟 button on each session card opens a modal that mirrors the session's tmux pane (full scrollback, ANSI colors via xterm.js) and lets you type a line and send it straight to the session. Backend:
  - `GET /api/v1/session/:id/terminal` → `tmux capture-pane -p -e -S -3000` (scrollback + colors)
  - `POST /api/v1/session/:id/keys` → `tmux send-keys -l -- <text>` (+ Enter)
  - The modal polls every 2 s (snapshot rendering, not a live PTY stream).
- **Gated behind `dashboard.allowTerminal` (off by default)** — this is close to full shell access and `capture-pane` can expose secrets visible in the terminal, so both endpoints return 404 unless `dashboard.allowTerminal: true` is set, and the 📟 button only appears when enabled. When the dashboard is bound beyond loopback, the existing Basic Auth still applies. Pane ids are validated against `^%\\d+$` and keystrokes are sent literally (`-l`) to prevent tmux option/key injection.

## 0.3.19 (2026-05-11)

### Fixes

- **`claude-pager run` auto-start now verifies the daemon actually came up** — 0.3.18 spawned the daemon and immediately reported success, so if the daemon refused to start (e.g. an insecure `ntfy.sh` config from 0.3.14 or a bad `dashboard.bind` from 0.3.17) `run` lied and the user got no notifications with no clue why. Now:
  - presence is probed with a real `GET /api/v1/health` (not just the pidfile) before deciding to spawn;
  - after spawning, `/api/v1/health` is polled for ~4 s and the result is reported honestly — `✓ Started`, `⚠ spawned but not responding` (with the last 8 lines of `~/.claude-pager/daemon-stdout.log`), or `⚠ could not auto-start` (spawn itself failed).

## 0.3.18 (2026-05-11)

### Features

- **`claude-pager run` auto-starts the daemon** — running `claude-pager run` in a fresh terminal no longer silently produces a Claude session with no notifications because the daemon wasn't up. `run` now checks the pidfile and, if no daemon is alive, spawns `claude-pager start` as a detached background process (`child_process.spawn` with `detached: true` + `unref()`) that outlives the command and the tmux session. Works on macOS and Linux — no systemd/launchd needed. If a daemon is already running (including one managed by systemd/launchd, since the pidfile is shared) nothing is spawned. The detached daemon's stdout/stderr go to `~/.claude-pager/daemon-stdout.log`. *(0.3.18 was a git tag only and never published to npm — superseded by 0.3.19 which adds the health check.)*

## 0.3.17 (2026-05-08)

### Features

- **Expose the dashboard beyond `localhost` with HTTP Basic Auth** — until now the daemon hard-coded `host: '127.0.0.1'`, so the dashboard could only be reached from the host itself. New `dashboard` config block:
  ```jsonc
  {
    "dashboard": {
      "bind": "0.0.0.0",                       // or LAN address
      "basicAuth": { "user": "u", "password": "..." }
    }
  }
  ```
  - The daemon refuses to start when `bind` is non-loopback and no `basicAuth` is set, mirroring the ntfy.sh hardening from 0.3.14. Escape hatch for "behind a trusted reverse proxy" setups: `dashboard.allowInsecure: true`.
  - Loopback requests (`127.0.0.1`, `::1`, `::ffff:127.0.0.1`) bypass the auth check, so `claude-pager-hook` keeps posting events without sharing credentials.
  - Authentication uses `crypto.timingSafeEqual` on both user and password — no length or content side-channel.
  - 19 new tests cover the auth helpers and the startup-config check.

### Notes

- For LAN-only access, Basic Auth without TLS is acceptable on a trusted network. For exposure beyond your LAN, put the daemon behind a reverse proxy with HTTPS (set `dashboard.allowInsecure: true` and let the proxy handle auth), or use a VPN like Tailscale and keep the default loopback bind.

## 0.3.16 (2026-05-04)

### UX

- **Projects with a pending question float to the top** — until now, pinned projects always sat at the top of the dashboard regardless of state, so an unpinned project asking for permission could be hidden below pinned-but-quiet projects. Sort is now two-tier: any project with at least one session in `waiting_permission` or `waiting_input` is shown first; pinned order is preserved within each tier so an important pinned project keeps its place when nothing's asking.

## 0.3.15 (2026-05-03)

### UX

- **Show Claude's last reply on idle cards** — when Claude finishes a turn the dashboard would only display the 2-line clamped title; the actual answer + the question at its end were invisible until Claude Code fired its 60s `idle_prompt` notification (and they disappeared again as soon as the user replied to it). The card now always renders the latest assistant text in a scrollable area when the session is not actively working and has no pending event, autoscrolled to the bottom so the question stays in view.

## 0.3.14 (2026-05-03)

### Security

- **CRITICAL — Telegram bot now filters by `chat_id`** — handlers (`callback_query`, voice, reply, free message) accepted updates from any Telegram user that started a conversation with the bot. An attacker who guessed the bot username could pilot Claude (free message → injected via tmux `send-keys` into the active session), add notes, or trigger expensive voice transcription on the host. The poll loop now drops every update whose `chat.id` does not match `config.chatId`.
- **`ntfy.sh` default topic refused without auth** — starting with `channel.ntfy.server = ntfy.sh` and no token / basic auth would let anyone who guessed the topic publish a message that the daemon treats as a response and injects into your terminal. The daemon now refuses to start in that configuration. Either configure auth, self-host ntfy, or — only if you accept the risk — set `channel.ntfy.allowInsecure: true` in the config (or `CLAUDE_PAGER_ALLOW_INSECURE_NTFY=1`).

### Fixes

- **Privacy leak in source comment** — `src/dashboard/transcript.ts` had an example comment hardcoded with the developer's username and a private project name. Replaced with a generic `-home-user-dev-myproject` placeholder.

## 0.3.13 (2026-05-03)

### Fixes

- **Idle prompt content stale and chopped on the wrong end** — the pending event's message is frozen at notification time, but Claude often keeps adding text afterwards (more tool calls, follow-up explanations, then the actual question). The dashboard's `slice(0, 3000)` then chopped the *end* — exactly where Claude's question lives — leaving the user with a truncated mid-sentence ("…**Phase A po"). Two changes:
  - `parseTranscript` now also exposes `lastAssistantText`, walking backward across multiple assistant messages until the next real user prompt (same logic the hook uses).
  - For `idle_prompt` pending events, the enricher prefers `transcript.lastAssistantText` over the frozen `event.message` and slices from the *end* on overflow so the question is preserved. Permission prompts keep `slice(0, 3000)` since their relevant data is at the start.

## 0.3.12 (2026-05-03)

### Fixes

- **Idle prompt context truncated to the last assistant follow-up** — `extractLastAssistantMessage` returned only the very last assistant message, which is often a short follow-up after a tool call (e.g. "App fermée. J'attends ton choix entre A, B, ou A+B avant de coder.") while the actual question with options A/B was several entries earlier, separated by a `tool_use` and a `tool_result`. The hook now walks backward across multiple assistant messages, skipping `tool_result`/`attachment`/`system` entries, and stops at the next real user prompt — restoring the full context the user is being asked to react to. Cap remains 3500 chars.

## 0.3.11 (2026-05-03)

### Capture pending tool data via PreToolUse hook

- **New `claude-pager-hook pre-tool-use`** — captures `tool_name` + `tool_input` from Claude Code's PreToolUse payload (which fires *before* the permission prompt) into `~/.claude-pager/pre-tool-use/<sessionId>.json`. The Notification hook now reads this file first when handling a permission_prompt and falls back to the transcript scan only if no fresh capture is available. Captures older than 60s are ignored.
- **`claude-pager setup` now installs the PreToolUse hook** in `~/.claude/settings.json`. Existing installs need a one-line addition (see README) — or just re-run `claude-pager setup`.
- This finally fixes the long-standing case where Claude fires the Notification hook before writing the new `tool_use` to the transcript: the dashboard now shows the actual command body for Bash, Edit, Monitor, and any other tool, instead of either stale data (pre-0.3.10) or just the generic header (0.3.10).

## 0.3.10 (2026-05-02)

### Fixes

- **Permission prompt enriched with the previously executed tool's data** — Claude Code fires the Notification hook for a new permission prompt *before* writing the new `tool_use` to the transcript. The hook scanned backward and returned the most-recent `tool_use`, which was actually the previously *resolved* one (e.g. an `oidc-config.json` curl that just finished, while Claude was now asking permission for an unrelated TOKEN_RESPONSE command). Hook now collects every `tool_use_id` that already has a matching `tool_result` in the recent window and skips those when picking the pending tool. When no unresolved `tool_use` exists, the hook sends no tool data at all and the dashboard shows the generic message — not ideal but never wrong.
- **Bash command body truncated at 400 chars in dashboard** — `formatToolInput` rendered Bash commands as a single-line `<code>` with `slice(0, 400)`. Long commands (heredocs, pipelines, smoke tests) were chopped well before the interesting part. Now rendered as `<pre>` with `pre-wrap`, `slice(0, 3000)`, and `max-height: 200px; overflow-y: auto` so long commands scroll inside the card.

## 0.3.9 (2026-05-02)

### UX

- **Auto-scroll to the question in idle prompts** — long idle_prompt messages now auto-scroll to the bottom on every dashboard render, so the actual question (which Claude puts at the end of its last assistant message) is visible without manual scrolling. Affects only the scrollable message area added in 0.3.7; permission prompts are unchanged.

## 0.3.8 (2026-05-02)

### Observability

- **Persistent hook + daemon logs** — diagnosing missing prompts was guesswork because the hook's stderr was swallowed by Claude Code and the daemon had no log file. Two append-only logs are now written under `~/.claude-pager/`:
  - `hook.log` — every `claude-pager-hook` invocation: `<ts> session-start <sessionId> registered` or `<ts> notification <sessionId> sent:<type> | skipped:type=<x> | error:<reason>`.
  - `daemon.log` — incoming events and resolutions: `<ts> received <type> <sessionId> <eventId> short=<n>`, `<ts> rejected <sessionId> <reason>`, `<ts> resolved <sessionId> <eventId> via=<respond|respond-to>`, `<ts> inject-failed <sessionId> <eventId>`.
  Logs never include message content (only metadata) and silently no-op if the filesystem is unwritable, so they cannot break operation.

## 0.3.7 (2026-05-02)

### Fixes

- **Idle prompt question hidden by truncation** — the dashboard sliced messages to 200 chars on the server and 150 chars on the client, cutting off the actual question that Claude puts at the *end* of an idle_prompt (the hook already enriches with the last 3500 chars of the assistant message). Server cap is now 3000 chars and the client renders the message with `pre-wrap` and `max-height: 240px; overflow-y: auto` so long messages scroll inside the card instead of being chopped.

## 0.3.6 (2026-05-02)

### Fixes

- **Recovered sessions show transcript and pending questions** — `claude-pager recover` registered sessions under synthetic ids (`recovered-1`, `recovered-2`, …) that didn't match any real Claude Code transcript. The dashboard then showed "No transcript", state stayed `unknown` (no "Working" badge), and pending permission prompts were invisible because pending events are filed under the real session UUID. Recover now scans `~/.claude/projects/<cwd>/*.jsonl`, sorts by mtime, and assigns each pane the freshest unclaimed transcript UUID. Falls back to `recovered-N` only when no transcript exists for the pane's cwd. Old `recovered-*` placeholders from previous runs are also dropped so panes don't appear twice.

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

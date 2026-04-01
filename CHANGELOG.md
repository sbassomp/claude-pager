# Changelog

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
